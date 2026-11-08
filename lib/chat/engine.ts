import { check } from "@/lib/db";
import { admin } from "@/lib/supabase/admin";
import { askJson, type LlmCfg } from "@/lib/llm";
import { chatState, chatSystem, evalSchema, evalSystem, leaks, turnSchema } from "@/lib/chat/prompt";
import { ASK_METHOD, ASK_NEXT, earlyClose, METHOD, checkpoints, countDone, hasNum, norm, offStreak, OFF_REPLIES, SOS_REPLY, stepOf, tighten, verdict, verify } from "@/lib/chat/progress";
import { GREETING_FALLBACK } from "@/lib/greeting";
import { scrub } from "@/lib/pii";
import { log } from "@/lib/log";
import type { Problem } from "@/lib/schema/problem";

export type Session = { id: string; link_id: string; anon_id: string; step: number; hint_level: number; progress?: number; started_at: string; status: string };
type Msg = { role: "student" | "bot"; content: string; hint_level: number | null };

const SOS = /tự tử|muốn chết|tự (làm )?đau|tự hại|bị (đánh|bắt nạt|bạo hành)/i; // dấu hiệu cần người lớn: không gọi AI, trả câu mẫu và gắn cờ cho giáo viên
const IDK = /không biết|ko biết|chịu|bó tay|khó quá|không hiểu|giải (giúp|hộ)|cho (mình )?đáp án/i;
const MAX_TURNS = 20; // trần số tin học sinh mỗi phiên: quá mức này mà chưa xong thì chốt phiên, không để lặp vô hạn
const CLOSING = "Bạn đã tự giải xong bài này, cách làm của bạn hợp lý. Làm tốt lắm!";
const INJECT = /ignore (all |previous |the )?(instruction|prompt)|system prompt|prompt (của|cua) (bạn|mày)|bỏ qua (mọi |các |tất cả )?(hướng dẫn|chỉ dẫn|quy tắc|lệnh)|quên (mọi |các )?(hướng dẫn|quy tắc)|đóng vai|jailbreak|developer mode/i;

export type Tm = Record<string, number>; // thời gian từng bước (ms), route đưa ra header Server-Timing
const timed = <T>(tm: Tm | undefined, k: string, p: Promise<T>) => {
  const t0 = Date.now();
  return p.finally(() => { if (tm) tm[k] = (tm[k] ?? 0) + Date.now() - t0; });
};

// all: mọi tin của phiên theo thứ tự (route đã đọc sẵn một lần để kiểm tra giới hạn, khỏi đọc lại).
export async function turn(cfg: LlmCfg, s: Session, p: Problem, studentText: string | null, teacherId: string, all: Msg[], tm?: Tm) {
  const db = admin();
  const prior = all.filter((m) => m.role === "student").map((m) => m.content);
  // Chỉ gửi 8 tin gần nhất: tiến độ đã lưu ở s.progress nên không cần cả hội thoại.
  const history = all.slice(-8);
  const clean = studentText === null ? null : scrub(studentText);

  while (history[0]?.role === "bot") history.shift(); // lượt đầu gửi AI phải là của học sinh
  const cps = checkpoints(p);
  const mask0 = s.progress ?? 0;
  const said = [...prior, clean ?? ""].join("\n");
  const sos = clean !== null && SOS.test(clean);
  const off = sos || (clean !== null && INJECT.test(clean)); // cố đổi vai/lấy prompt hoặc cần người lớn: không gọi AI
  const v = clean === null ? undefined : verdict(clean, p, cps);
  // Trạng thái đổi theo lượt gắn vào cuối tin học sinh để system prompt giữ nguyên (cache được).
  const turns = [
    ...history.map((m) => ({ role: (m.role === "student" ? "user" : "model") as "user" | "model", text: m.content })),
    { role: "user" as const, text: `${clean ?? "(Học sinh vừa mở bài. Hãy chào ngắn và hỏi mốc đầu tiên.)"}
${chatState(cps, mask0, s.hint_level, v)}` },
  ];
  // Lưu tin học sinh song song với lúc chờ AI: bớt một vòng chờ DB.
  const saveStudent = clean === null ? null : Promise.resolve(db.from("messages").insert({ session_id: s.id, role: "student", content: clean } as never)).then(check);
  const out = off ? null : await timed(tm, "ai", askJson(cfg, chatSystem(p, cps), turns, turnSchema, { maxTokens: 400, deadlineMs: 40_000, attemptMs: 8_000 })).catch(async (e) => { await saveStudent?.catch(() => {}); throw e; });
  await saveStudent;

  // Server xác minh bằng chứng AI nộp, không tin AI tự báo "xong". Mốc làm đúng thứ tự: chỉ tính mốc đầu tiên chưa xong và các mốc sau nếu đủ bằng chứng.
  const onTopic = !!out && out.on_topic;
  let mask = mask0;
  // 1) Mốc có số đáp án: server tự xác minh, đủ khi học sinh đã tự viết mọi số của mốc ở bất kỳ tin nào trong phiên. Không phụ thuộc AI nên không kẹt.
  if (clean !== null && !off) for (const c of cps) if (c.must.length && c.must.every((n) => hasNum(said, n))) mask |= 1 << c.id;
  // 2) Mốc không có số (lập biến, giải thích, kiểm tra...): cần AI nộp bằng chứng trích nguyên văn từ tin của học sinh. id AI báo là số mốc 1-based.
  if (onTopic) for (const d of out!.steps_done) {
    const c = cps[d.id - 1];
    if (c && !(mask >> c.id & 1) && verify(c, d.evidence, said)) mask |= 1 << c.id;
  }
  // 3) Cách làm: AI xác nhận học sinh tự trình bày cách làm đúng, server kiểm trích dẫn có thật trong tin học sinh. Chưa có thì chưa kết thúc dù đã nêu đủ đáp án.
  const ev = norm(out?.method_evidence ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (onTopic && out!.method_ok && ev.length >= 3 && norm(said).replace(/\s+/g, " ").toLowerCase().includes(ev)) mask |= METHOD;
  // 4) Chống vòng quanh: mọi mốc có số đã xong mà mốc còn lại chỉ là lời giải thích, sau nhiều lượt vẫn chưa nộp được bằng chứng thì coi như xong.
  const numeric = cps.filter((c) => c.must.length);
  if (numeric.length && numeric.every((c) => mask >> c.id & 1) && prior.length + 1 >= Math.max(8, cps.length * 3)) { for (const c of cps) mask |= 1 << c.id; mask |= METHOD; }
  const progressed = mask !== mask0;
  const done = countDone(mask);
  const finished = onTopic && done >= cps.length && !!(mask & METHOD);
  const step = finished ? 5 : Math.min(4, stepOf(done, cps.length));
  // Tăng mức gợi ý theo tín hiệu server (số không khớp, "không biết") chứ không chỉ cờ struggling do AI tự báo. Tối đa mức 4.
  const stuck = onTopic && !progressed && (out!.struggling || (v?.miss.length ?? 0) > 0 || IDK.test(clean ?? ""));
  const hint = stuck ? Math.min(4, s.hint_level + 1) : s.hint_level;

  // Lạc đề: thang 3 bậc theo số lần liên tiếp (nhắc nhẹ, nhắc kèm mời, chốt phiên). Cần người lớn thì trả câu mẫu và gắn cờ, không tính vào thang.
  const streak = offStreak(history);
  const closeOff = !onTopic && !sos && !out?.distress && streak >= 2;
  const cry = sos || (!onTopic && !!out?.distress);
  // Bot chỉ được nói số kết quả/trung gian mà học sinh đã tự nêu. Vi phạm thì dùng câu trung tính.
  let reply = onTopic ? tighten(out!.reply) : cry ? SOS_REPLY : OFF_REPLIES[Math.min(streak, 2)];
  if (cry) await log({ actor: "system", action: "student_distress", teacherId, anonId: s.anon_id, linkId: s.link_id });
  // AI viết lời tổng kết (không có câu hỏi) nhưng server chưa xác nhận cách làm: không để bot chào kết trong khi phiên còn mở, hỏi lại cách làm.
  if (onTopic && !finished && earlyClose(reply)) reply = done >= cps.length ? ASK_METHOD : ASK_NEXT;
  // ponytail: không còn gọi AI lần hai khi bot lặp câu trước (tốn 2-3s mỗi lần). Nếu lặp nhiều, thêm câu mẫu thay phiên dựa vào sim().
  // Lời kết phải là lời kết: không câu hỏi, không mời làm thêm. AI lỡ viết thế thì dùng câu kết mẫu.
  if (finished && /\?|làm thêm|bài (khác|tiếp)|mở rộng/i.test(reply)) reply = CLOSING;
  const given = [p.data, p.statement, said, cps.filter((c) => mask >> c.id & 1).map((c) => c.must)];
  if (leaks(reply, p.solution, given, p.solution_steps)) {
    reply = "Mình thấy bạn đang đi đúng hướng. Bạn thử viết tiếp bước tính tiếp theo của mình nhé?"; // không gọi AI viết lại: chậm thêm 2-3s
    await log({ actor: "system", action: "answer_leak_blocked", teacherId, anonId: s.anon_id, linkId: s.link_id });
  }
  // Đủ trần lượt mà chưa xong: chốt phiên, nêu tiến độ và gợi ý cho lần sau (câu mẫu, không gọi AI, không có câu hỏi).
  const capped = !finished && !closeOff && !cry && prior.length + 1 >= MAX_TURNS;
  if (capped) {
    const nxt = cps.find((c) => !(mask >> c.id & 1));
    const h = nxt && p.hints.find((x) => x.level === nxt.id + 1)?.text;
    reply = `Mình dừng bài ở đây nhé, bài này khá dài. Bạn đã xong ${done}/${cps.length} mốc.${h && !leaks(h, p.solution, given, p.solution_steps) ? ` Lần sau thử lại từ chỗ này: ${h}` : ""}`;
    await log({ actor: "system", action: "session_capped", teacherId, anonId: s.anon_id, linkId: s.link_id, meta: { done } });
  }
  await timed(tm, "db_save", Promise.all([
    db.from("messages").insert({ session_id: s.id, role: "bot", content: reply, step, hint_level: hint } as never).then(check),
    db.from("chat_sessions").update({ step, hint_level: hint, progress: mask } as never).eq("id", s.id).then(check),
  ]));

  if (closeOff) await log({ actor: "system", action: "session_off_topic_closed", teacherId, anonId: s.anon_id, linkId: s.link_id });
  if (finished || capped || closeOff) await finish(cfg, s, p, teacherId);
  return { reply, step, done: finished || capped || closeOff };
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

// Lời mở đầu không gọi AI lúc chat: dùng câu chào AI đã tạo sẵn khi nạp đề (p.greeting). Tiết kiệm 1 lượt/phiên.
export async function openingTurn(s: Session, p: Problem) {
  const reply = p.greeting || GREETING_FALLBACK;
  check(await admin().from("messages").insert({ session_id: s.id, role: "bot", content: reply, step: 1, hint_level: 1 } as never));
  return { reply, step: 1, done: false };
}
