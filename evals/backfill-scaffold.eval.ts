import { readFileSync } from "node:fs";
import { it } from "vitest";

// Bổ sung step_subs (câu hỏi con) + step_analog (ví dụ tương tự) cho đề đã có. Không đụng goal, hints, traps, checks. Mặc định CHỈ IN, không ghi DB.
// Biến môi trường: BACKFILL_LIMIT (số đề, mặc định 3), BACKFILL_WRITE=1 (ghi vào DB), BACKFILL_CODE (chỉ một mã đề), BACKFILL_REDO=1 (làm lại cả đề đã có).
// Chạy: npx vitest run --config vitest.eval.config.mts evals/backfill-scaffold.eval.ts
const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).flatMap((l) => { const m = l.match(/^([A-Za-z_]+)=(.*)$/); return m ? [[m[1], m[2].replace(/^["']|["']$/g, "")]] : []; }));
Object.assign(process.env, env);
const LIMIT = Number(process.env.BACKFILL_LIMIT ?? 3);
const WRITE = process.env.BACKFILL_WRITE === "1";
const REDO = process.env.BACKFILL_REDO === "1";

it("bổ sung câu hỏi con + ví dụ tương tự cho đề cũ", async () => {
  const { admin } = await import("../lib/supabase/admin");
  const { makeStepScaffold } = await import("../lib/step-scaffold");
  const { PROVIDERS, TEMPERATURE } = await import("../lib/models");
  const { problemSchema } = await import("../lib/schema/problem");
  const db = admin();
  let q = db.from("problems").select("id,code,content").is("deleted_at", null);
  if (process.env.BACKFILL_CODE) q = q.eq("code", process.env.BACKFILL_CODE);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const cfg = { provider: "gemini" as const, key: env.GEMINI_KEY, model: PROVIDERS.gemini.models[0], temperature: TEMPERATURE, use: "backfill_scaffold" };
  let done = 0, skipped = 0, failed = 0;
  for (const row of (data ?? []) as { id: string; code: string; content: unknown }[]) {
    if (done >= LIMIT) break;
    const p = problemSchema.safeParse(row.content);
    if (!p.success || !p.data.solution_steps.length) { skipped++; continue; }
    const n = p.data.solution_steps.length;
    if (!REDO && p.data.step_subs.length === n && p.data.step_analog.length === n) { skipped++; continue; } // đã có
    const sc = await makeStepScaffold(cfg, p.data);
    if (!sc) { failed++; console.log(`[${row.code}] AI không trả đủ ${n} bước`); continue; }
    console.log(`\n[${row.code}] ${p.data.title}`);
    sc.subs.forEach((s, i) => console.log(`  Bước ${i + 1}: ${p.data.step_goals[i] || p.data.solution_steps[i]}\n     chia nhỏ: ${s.length ? s.join(" | ") : "(trống)"}\n     ví dụ: ${sc.analogs[i] || "(trống)"}`));
    if (WRITE) {
      const r = await db.from("problems").update({ content: { ...(row.content as object), step_subs: sc.subs, step_analog: sc.analogs } } as never).eq("id", row.id);
      if (r.error) throw new Error(r.error.message);
    }
    done++;
  }
  console.log(`\nXong: ${done} đề ${WRITE ? "đã ghi DB" : "(chỉ in, chưa ghi)"}, bỏ qua ${skipped}, lỗi ${failed}`);
}, 1_800_000);
