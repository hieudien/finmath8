import { readFileSync } from "node:fs";
import { it } from "vitest";

// Bổ sung step_formats + step_examples cho đề đã có (không đụng goal, hints, traps). Mặc định CHỈ IN, không ghi DB.
// Biến môi trường: BACKFILL_LIMIT (số đề, mặc định 3), BACKFILL_WRITE=1 (ghi vào DB), BACKFILL_CODE (chỉ một mã đề).
// Chạy: npx vitest run --config vitest.eval.config.mts evals/backfill-formats.eval.ts
const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).flatMap((l) => { const m = l.match(/^([A-Za-z_]+)=(.*)$/); return m ? [[m[1], m[2].replace(/^["']|["']$/g, "")]] : []; }));
Object.assign(process.env, env);
const LIMIT = Number(process.env.BACKFILL_LIMIT ?? 3);
const WRITE = process.env.BACKFILL_WRITE === "1";

it("bổ sung dạng cần viết + ví dụ cho đề cũ", async () => {
  const { admin } = await import("../lib/supabase/admin");
  const { makeStepFormats } = await import("../lib/step-guides");
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
    if (p.data.step_formats.length === p.data.solution_steps.length) { skipped++; continue; } // đã có
    const f = await makeStepFormats(cfg, p.data);
    if (!f) { failed++; console.log(`[${row.code}] AI không trả đủ ${p.data.solution_steps.length} bước`); continue; }
    console.log(`\n[${row.code}] ${p.data.title}`);
    f.formats.forEach((x, i) => console.log(`  Bước ${i + 1}: ${x || "(trống)"}  | ví dụ: ${f.examples[i] || "(trống)"}`));
    if (WRITE) {
      const r = await db.from("problems").update({ content: { ...(row.content as object), step_formats: f.formats, step_examples: f.examples } } as never).eq("id", row.id);
      if (r.error) throw new Error(r.error.message);
    }
    done++;
  }
  console.log(`\nXong: ${done} đề ${WRITE ? "đã ghi DB" : "(chỉ in, chưa ghi)"}, bỏ qua ${skipped}, lỗi ${failed}`);
}, 1_800_000);
