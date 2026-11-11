import { readFileSync } from "node:fs";
import { it } from "vitest";

// Bổ sung step_formats + step_examples cho đề đã có (không đụng goal, hints, traps). Mặc định CHỈ IN, không ghi DB.
// Biến môi trường: BACKFILL_LIMIT (số đề, mặc định 3), BACKFILL_WRITE=1 (ghi vào DB), BACKFILL_CODE (chỉ một mã đề).
// Chạy: npx vitest run --config vitest.eval.config.mts evals/backfill-formats.eval.ts
const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).flatMap((l) => { const m = l.match(/^([A-Za-z_]+)=(.*)$/); return m ? [[m[1], m[2].replace(/^["']|["']$/g, "")]] : []; }));
Object.assign(process.env, env);
const LIMIT = Number(process.env.BACKFILL_LIMIT ?? 3);
const WRITE = process.env.BACKFILL_WRITE === "1";
const REDO = process.env.BACKFILL_REDO === "1"; // làm lại cả đề đã có format và viết lại step_goals (chỉ ghi đè mục tiêu không rỗng; hints, traps, checks giữ nguyên)

it("bổ sung dạng cần viết + ví dụ cho đề cũ", async () => {
  const { admin } = await import("../lib/supabase/admin");
  const { makeStepFormats, makeStepGuides } = await import("../lib/step-guides");
  const { PROVIDERS, TEMPERATURE } = await import("../lib/models");
  const { problemSchema } = await import("../lib/schema/problem");
  const db = admin();
  let q = db.from("problems").select("id,code,content").is("deleted_at", null);
  if (process.env.BACKFILL_CODE) q = q.eq("code", process.env.BACKFILL_CODE);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const cfg = { provider: "gemini" as const, key: env.GEMINI_KEY, model: PROVIDERS.gemini.models[0], temperature: TEMPERATURE, use: "backfill_formats" };
  let done = 0, skipped = 0, failed = 0;
  for (const row of (data ?? []) as { id: string; code: string; content: unknown }[]) {
    if (done >= LIMIT) break;
    const p = problemSchema.safeParse(row.content);
    if (!p.success || !p.data.solution_steps.length) { skipped++; continue; }
    if (!REDO && p.data.step_formats.length === p.data.solution_steps.length) { skipped++; continue; } // đã có
    // REDO: viết lại goal và hints (giữ lại bản cũ ở chỗ AI trả rỗng; step_checks, error_traps không đụng), rồi sinh format dựa trên goal mới.
    let q = p.data;
    if (REDO) {
      const g = await makeStepGuides(cfg, q);
      if (g) q = { ...q, step_goals: g.goals.map((x, i) => x || q.step_goals[i] || ""), step_hints: g.hints.map((h, i) => h.map((x, j) => x || q.step_hints[i]?.[j] || "")) };
    }
    const f = await makeStepFormats(cfg, q);
    if (!f) { failed++; console.log(`[${row.code}] AI không trả đủ ${q.solution_steps.length} bước`); continue; }
    console.log(`
[${row.code}] ${q.title}`);
    f.formats.forEach((x, i) => console.log(`  Bước ${i + 1}: ${q.step_goals[i] || "(trống)"}
     cần viết: ${x || "(trống)"}  | ví dụ: ${f.examples[i] || "(trống)"}
     gợi ý: ${(q.step_hints[i] ?? []).join(" / ")}`));
    if (WRITE) {
      const r = await db.from("problems").update({ content: { ...(row.content as object), step_formats: f.formats, step_examples: f.examples, step_goals: q.step_goals, step_hints: q.step_hints } } as never).eq("id", row.id);
      if (r.error) throw new Error(r.error.message);
    }
    done++;
  }
  console.log(`\nXong: ${done} đề ${WRITE ? "đã ghi DB" : "(chỉ in, chưa ghi)"}, bỏ qua ${skipped}, lỗi ${failed}`);
}, 1_800_000);
