import { check } from "@/lib/db";
import { admin } from "@/lib/supabase/admin";
import { askJson, type LlmCfg } from "@/lib/llm";
import { evalSchema, evalSystem } from "@/lib/chat/prompt";
import { log } from "@/lib/log";
import type { Problem } from "@/lib/schema/problem";

export type Session = { id: string; link_id: string; anon_id: string; step: number; hint_level: number; struggled?: number; started_at: string; status: string };
export type Msg = { role: "student" | "bot"; content: string; hint_level: number | null; meta?: { kind?: string } | null };

export const SOS = /tự tử|muốn chết|tự (làm )?đau|tự hại|bị (đánh|bắt nạt|bạo hành)/i; // dấu hiệu cần người lớn: không gọi AI, trả câu mẫu và gắn cờ cho giáo viên
export const INJECT = /ignore (all |previous |the )?(instruction|prompt)|system prompt|prompt (của|cua) (bạn|mày)|bỏ qua (mọi |các |tất cả )?(hướng dẫn|chỉ dẫn|quy tắc|lệnh)|quên (mọi |các )?(hướng dẫn|quy tắc)|đóng vai|jailbreak|developer mode/i;

const VER = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
// Mọi tin của bot ghi qua đây: meta.kind (right, wrong, hint, ask, reveal, off_topic, blocked, distress, capped, done, open, stuck, reply), meta.ai_ms (thời gian chờ AI) và meta.v (bản code).
export const botMsg = (sid: string, m: { content: string; step?: number; hint_level?: number; kind: string; ms?: number; parts?: Record<string, number>; fast?: boolean }) =>
  admin().from("messages").insert({ session_id: sid, role: "bot", content: m.content, step: m.step ?? null, hint_level: m.hint_level ?? null, meta: { kind: m.kind, ai_ms: m.ms, v: VER, ...(m.parts && Object.keys(m.parts).length ? { ai_parts: m.parts } : {}), ...(m.fast ? { fast: true } : {}) } } as never);

export type Tm = Record<string, number>; // thời gian từng bước (ms), route đưa ra header Server-Timing
// Cộng thời gian một lần gọi AI vào tổng (ai) và vào khóa riêng (ai_<tên>) để biết lần gọi nào chậm.
export const addAi = (tm: Tm | undefined, key: string, ms: number) => { if (tm) { tm.ai = (tm.ai ?? 0) + ms; tm[`ai_${key}`] = (tm[`ai_${key}`] ?? 0) + ms; } };

// Chấm điểm cuối phiên bằng một lượt AI (4 tiêu chí 0–3), ghi session_evals và chốt phiên. Đã có điểm thì bỏ qua.
export async function finish(cfg: LlmCfg, s: Session, p: Problem, teacherId: string) {
  const db = admin();
  const { data: ev } = await db.from("session_evals").select("session_id").eq("session_id", s.id).maybeSingle();
  if (ev) return;
  const { data } = await db.from("messages").select("role,content,hint_level,meta").eq("session_id", s.id).order("id");
  const msgs = (data ?? []) as Msg[];
  const transcript = msgs.map((m) => `${m.role === "student" ? "HS" : "Bot"}: ${m.content}`).join("\n");
  const r = await askJson(cfg, evalSystem(p), [{ role: "user", text: transcript || "(không có hội thoại)" }], evalSchema, { use: "eval" });
  const c = (n: number) => Math.min(3, Math.max(0, Math.round(n)));
  const [identify, plan, calculate, explain] = [r.identify, r.plan, r.calculate, r.explain].map(c);
  // Gợi ý đếm theo tin gợi ý bot đã gửi (không theo bước: mức về 0 mỗi khi học sinh tiến thêm nên không dùng chỗ nhảy mức).
  const hints = msgs.filter((m) => m.role === "bot" && m.meta?.kind === "hint");
  const maxHint = Math.max(1, ...hints.map((m) => m.hint_level ?? 1));
  const hintCount = hints.length;
  const duration = Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000);
  const total = identify + plan + calculate + explain;
  // Hai lượt chốt phiên có thể chạy gần như cùng lúc (tin cuối tự chốt + gửi thêm tin gần trần): bản chấm đến sau bỏ qua thay vì lỗi trùng khóa.
  check(await db.from("session_evals").upsert({
    session_id: s.id, identify, plan, calculate, explain, total, final_correct: r.final_correct,
    max_hint_level: maxHint, hint_count: hintCount, errors: r.errors, duration_s: duration
  } as never, { onConflict: "session_id", ignoreDuplicates: true }));
  check(await db.from("chat_sessions").update({ status: "done", ended_at: new Date().toISOString() } as never).eq("id", s.id));
  await log({ actor: "system", action: "eval_done", teacherId, anonId: s.anon_id, linkId: s.link_id, meta: { total } });
  await log({ actor: "student", action: "chat_session_ended", teacherId, anonId: s.anon_id, linkId: s.link_id });
}
