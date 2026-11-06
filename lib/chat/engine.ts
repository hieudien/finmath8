import { check } from "@/lib/db";
import { admin } from "@/lib/supabase/admin";
import { askJson, type LlmCfg } from "@/lib/llm";
import { chatSystem, evalSchema, evalSystem, leaks, turnSchema } from "@/lib/chat/prompt";
import { scrub } from "@/lib/pii";
import { log } from "@/lib/log";
import type { Problem } from "@/lib/schema/problem";

export type Session = { id: string; link_id: string; anon_id: string; step: number; hint_level: number; started_at: string; status: string };
type Msg = { role: "student" | "bot"; content: string; hint_level: number | null };

export const FALLBACK = "Mình chưa thể nói đáp án ngay. Em thử viết ra các bước tính của mình nhé?";

export async function turn(cfg: LlmCfg, s: Session, p: Problem, studentText: string | null, teacherId: string) {
  const db = admin();
  const { data } = await db.from("messages").select("role,content,hint_level").eq("session_id", s.id).order("id");
  const history = (data ?? []) as Msg[];

  let clean: string | null = null;
  if (studentText !== null) {
    clean = scrub(studentText);
  }

  const turns = [
    ...history.map((m) => ({ role: (m.role === "student" ? "user" : "model") as "user" | "model", text: m.content })),
    { role: "user" as const, text: clean ?? "(Học sinh vừa mở bài. Hãy chào ngắn và hỏi bước 1.)" },
  ];
  const out = await askJson(cfg, chatSystem(p, s.step, s.hint_level), turns, turnSchema);

  if (clean !== null) {
    check(await db.from("messages").insert({ session_id: s.id, role: "student", content: clean } as never));
    await log({ actor: "student", action: "chat_message", teacherId, anonId: s.anon_id, linkId: s.link_id, meta: { role: "student", len: clean.length } });
  }
  const finished = out.step === 5 && out.student_correct;
  let reply = out.reply;
  if (!finished && leaks(reply, p.solution)) {
    reply = FALLBACK;
    await log({ actor: "system", action: "answer_leak_blocked", teacherId, anonId: s.anon_id, linkId: s.link_id });
  }
  const hint = Math.max(s.hint_level, out.hint_level);
  check(await db.from("messages").insert({ session_id: s.id, role: "bot", content: reply, step: out.step, hint_level: hint } as never));
  check(await db.from("chat_sessions").update({ step: out.step, hint_level: hint } as never).eq("id", s.id));
  await log({ actor: "student", action: "chat_message", teacherId, anonId: s.anon_id, linkId: s.link_id, meta: { role: "bot", len: reply.length, step: out.step } });

  if (finished) await finish(cfg, s, p, teacherId);
  return { reply, step: out.step, done: finished };
}

export async function finish(cfg: LlmCfg, s: Session, p: Problem, teacherId: string) {
  const db = admin();
  const { data: ev } = await db.from("session_evals").select("session_id").eq("session_id", s.id).maybeSingle();
  if (ev) return;
  const { data } = await db.from("messages").select("role,content,hint_level").eq("session_id", s.id).order("id");
  const msgs = (data ?? []) as Msg[];
  const transcript = msgs.map((m) => `${m.role === "student" ? "HS" : "Bot"}: ${m.content}`).join("\n");
  const r = await askJson(cfg, evalSystem(p), [{ role: "user", text: transcript || "(không có hội thoại)" }], evalSchema);
  const c = (n: number) => Math.max(0, Math.min(3, Math.round(n)));
  const [identify, plan, calculate, explain] = [r.identify, r.plan, r.calculate, r.explain].map(c);
  const bots = msgs.filter((m) => m.role === "bot");
  const maxHint = Math.max(1, ...bots.map((m) => m.hint_level ?? 1));
  const hintCount = bots.filter((m, i) => i > 0 && (m.hint_level ?? 1) > (bots[i - 1].hint_level ?? 1)).length;
  const duration = Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000);
  const total = identify + plan + calculate + explain;
  check(await db.from("session_evals").insert({
    session_id: s.id, identify, plan, calculate, explain, total, final_correct: r.final_correct,
    max_hint_level: maxHint, hint_count: hintCount, errors: r.errors, duration_s: duration,
  } as never));
  check(await db.from("chat_sessions").update({ status: "done", ended_at: new Date().toISOString() } as never).eq("id", s.id));
  await log({ actor: "system", action: "eval_done", teacherId, anonId: s.anon_id, linkId: s.link_id, meta: { total } });
  await log({ actor: "student", action: "chat_session_ended", teacherId, anonId: s.anon_id, linkId: s.link_id });
}

// Lời mở đầu không cần gọi Gemini: đề có statement thì dùng gợi ý mức 1 của đề. Tiết kiệm 1 lượt/phiên.
export async function openingTurn(s: Session, p: Problem, teacherId: string) {
  const reply = `Chào em! Mình sẽ cùng em giải bài này từng bước. ${p.hints.find((h) => h.level === 1)?.text ?? "Em đọc đề rồi cho mình biết đề hỏi gì nhé?"}`;
  check(await admin().from("messages").insert({ session_id: s.id, role: "bot", content: reply, step: 1, hint_level: 1 } as never));
  await log({ actor: "student", action: "chat_message", teacherId, anonId: s.anon_id, linkId: s.link_id, meta: { role: "bot", len: reply.length, step: 1, static: true } });
  return { reply, step: 1, done: false };
}
