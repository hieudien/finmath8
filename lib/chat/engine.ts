import { after } from "next/server";
import { check } from "@/lib/db";
import { admin } from "@/lib/supabase/admin";
import { askJson, type LlmCfg } from "@/lib/llm";
import { chatState, chatSystem, evalSchema, evalSystem, leaks, turnSchema } from "@/lib/chat/prompt";
import { keepOrAsk, METHOD, checkpoints, countDone, hasNum, norm, offStreak, OFF_REPLIES, SOS_REPLY, stepOf, tighten, verdict, verify } from "@/lib/chat/progress";
import { CLOSING_HELP, ladder, revealLine, reviewText, scoreCap } from "@/lib/chat/assist";
import { stepGoal } from "@/lib/chat/goals";
import { GREETING_FALLBACK } from "@/lib/greeting";
import { scrub } from "@/lib/pii";
import { log } from "@/lib/log";
import type { Problem } from "@/lib/schema/problem";

export type Session = { id: string; link_id: string; anon_id: string; step: number; hint_level: number; progress?: number; stall?: number; wrong?: number; revealed?: number; started_at: string; status: string; mode?: string };
export type Msg = { role: "student" | "bot"; content: string; hint_level: number | null };

export const SOS = /tự tử|muốn chết|tự (làm )?đau|tự hại|bị (đánh|bắt nạt|bạo hành)/i; // dấu hiệu cần người lớn: không gọi AI, trả câu mẫu và gắn cờ cho giáo viên
const IDK = /không biết|ko biết|chịu|bó tay|khó quá|không hiểu|giải (giúp|hộ)|cho (mình )?đáp án/i;
export const MAX_TURNS = 20; // trần số tin học sinh mỗi phiên: quá mức này mà chưa xong thì chốt phiên, không để lặp vô hạn
export const CLOSING = "Bạn đã tự giải xong bài này, cách làm của bạn hợp lý. Làm tốt lắm!";
export const INJECT = /ignore (all |previous |the )?(instruction|prompt)|system prompt|prompt (của|cua) (bạn|mày)|bỏ qua (mọi |các |tất cả )?(hướng dẫn|chỉ dẫn|quy tắc|lệnh)|quên (mọi |các )?(hướng dẫn|quy tắc)|đóng vai|jailbreak|developer mode/i;

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
  const out = off ? null : await timed(tm, "ai", askJson(cfg, chatSystem(p), turns, turnSchema, { maxTokens: 400, deadlineMs: 40_000, attemptMs: 8_000 })).catch(async (e) => { await saveStudent?.catch(() => {}); throw e; });
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
  // Thang gợi ý: hết mức gợi ý mà kẹt đủ lượt thì hiện lời giải của mốc hiện tại, ghi cờ revealed (chấm điểm chỉ tính phần tự làm).
  const lad = clean !== null && onTopic ? ladder("chat", s.hint_level, s.stall ?? 0, mask !== mask0) : { stall: s.stall ?? 0, reveal: false };
  let revealed = s.revealed ?? 0, revLine = "";
  const curCp = cps.find((c) => !(mask >> c.id & 1));
  if (lad.reveal && curCp) {
    mask |= 1 << curCp.id; revealed |= 1 << curCp.id; revLine = revealLine(curCp, cps.length);
    if (cps.every((c) => mask >> c.id & 1)) mask |= METHOD; // hết mốc: không còn gì để học sinh nêu cách làm
  }
  const progressed = mask !== mask0;
  const done = countDone(mask);
  const finished = onTopic && done >= cps.length && !!(mask & METHOD);
  const step = finished ? 5 : Math.min(4, stepOf(done, cps.length));
  // Tăng mức gợi ý theo tín hiệu server (số không khớp, "không biết") chứ không chỉ cờ struggling do AI tự báo. Tối đa mức 4.
  const stuck = onTopic && !progressed && (out!.struggling || (v?.miss.length ?? 0) > 0 || IDK.test(clean ?? ""));
  const hint = revLine ? 1 : stuck ? Math.min(4, s.hint_level + 1) : s.hint_level;

  // Lạc đề: thang 3 bậc theo số lần liên tiếp (nhắc nhẹ, nhắc kèm mời, chốt phiên). Cần người lớn thì trả câu mẫu và gắn cờ, không tính vào thang.
  const streak = offStreak(history);
  const closeOff = !onTopic && !sos && !out?.distress && streak >= 2;
  const cry = sos || (!onTopic && !!out?.distress);
  // Bot chỉ được nói số kết quả/trung gian mà học sinh đã tự nêu. Vi phạm thì dùng câu trung tính.
  let reply = onTopic ? tighten(out!.reply) : cry ? SOS_REPLY : OFF_REPLIES[Math.min(streak, 2)];
  if (cry) await log({ actor: "system", action: "student_distress", teacherId, anonId: s.anon_id, linkId: s.link_id });
  // AI viết lời tổng kết (không có câu hỏi) nhưng server chưa xác nhận cách làm: không để bot chào kết trong khi phiên còn mở, hỏi lại cách làm.
  if (onTopic && !finished) reply = keepOrAsk(reply, done >= cps.length);
  // ponytail: không còn gọi AI lần hai khi bot lặp câu trước (tốn 2-3s mỗi lần). Nếu lặp nhiều, thêm câu mẫu thay phiên dựa vào sim().
  // Lời kết phải là lời kết: không câu hỏi, không mời làm thêm. AI lỡ viết thế thì dùng câu kết mẫu.
  if (finished && /\?|làm thêm|bài (khác|tiếp)|mở rộng/i.test(reply)) reply = CLOSING;
  const given = [p.data, p.statement, said, cps.filter((c) => mask >> c.id & 1).map((c) => c.must)];
  if (leaks(reply, p.solution, given, p.solution_steps)) {
    reply = "Mình thấy bạn đang đi đúng hướng. Bạn thử viết tiếp bước tính tiếp theo của mình nhé?"; // không gọi AI viết lại: chậm thêm 2-3s
    await log({ actor: "system", action: "answer_leak_blocked", teacherId, anonId: s.anon_id, linkId: s.link_id });
  }
  // Lời giải hiện cho học sinh là chủ ý (đã hết gợi ý): đặt sau kiểm tra lộ đáp án. Phiên có bước được giải hộ thì lời kết là lời kết "có giúp", không khen tự giải.
  const nextCp = cps.find((c) => !(mask >> c.id & 1));
  if (finished && revealed) reply = `${revLine ? revLine + " " : ""}${CLOSING_HELP}`;
  else if (revLine) {
    const g = nextCp ? stepGoal(p, nextCp.id, cps.filter((c) => mask >> c.id & 1).map((c) => c.must)) : "";
    reply = `${revLine} ${g ? `Việc tiếp theo: ${g}` : "Bạn thử viết bước tiếp theo của mình nhé?"}`;
  }
  // Có bước được giải hộ thì chấm ngay để kèm gợi ý ôn tập vào lời kết. Lỗi thì chấm ngầm như thường (bên dưới).
  if (finished && revealed) reply = await withReview(cfg, s, p, teacherId, revealed, reply);
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
    db.from("chat_sessions").update({ step, hint_level: hint, progress: mask, stall: revLine ? 0 : lad.stall, revealed } as never).eq("id", s.id).then(check),
  ]));

  if (closeOff) await log({ actor: "system", action: "session_off_topic_closed", teacherId, anonId: s.anon_id, linkId: s.link_id });
  // Chấm điểm chạy ngầm sau khi trả lời: học sinh thấy lời kết ngay, khỏi chờ AI chấm 2-5 giây. Lỗi thì phiên vẫn "active", nút Kết thúc chấm lại.
  if (finished || capped || closeOff) after(() => finish(cfg, s, p, teacherId).catch((e) => console.error("finish failed", e)));
  return { reply, step, done: finished || capped || closeOff };
}

// Chấm ngay phiên có bước được giải hộ để nối gợi ý ôn tập vào lời kết. Lỗi thì giữ nguyên lời kết, chấm ngầm sau.
export async function withReview(cfg: LlmCfg, s: Session, p: Problem, teacherId: string, revealed: number, reply: string) {
  const rv = await finish(cfg, s, p, teacherId, revealed).catch((e) => { console.error("finish failed", e); return undefined; });
  return rv ? reply + reviewText(rv) : reply;
}

// rv: mặt nạ bước được giải hộ nếu người gọi đã có (chưa kịp ghi DB); không thì đọc từ phiên. Trả gợi ý ôn tập cho học sinh khi có bước được giải hộ.
export async function finish(cfg: LlmCfg, s: Session, p: Problem, teacherId: string, rv?: number): Promise<string[] | undefined> {
  const db = admin();
  const { data: ev } = await db.from("session_evals").select("session_id").eq("session_id", s.id).maybeSingle();
  if (ev) return;
  const { data } = await db.from("messages").select("role,content,hint_level").eq("session_id", s.id).order("id");
  const msgs = (data ?? []) as Msg[];
  const cps = checkpoints(p);
  const revealed = rv ?? ((await db.from("chat_sessions").select("revealed").eq("id", s.id).maybeSingle()).data as { revealed: number } | null)?.revealed ?? 0;
  const helped = cps.filter((x) => revealed >> x.id & 1);
  const transcript = msgs.map((m) => `${m.role === "student" ? "HS" : "Bot"}: ${m.content}`).join("\n")
    + (helped.length ? `\n[Hệ thống: bot đã hiện lời giải các bước ${helped.map((x) => x.id + 1).join(", ")} (học sinh KHÔNG tự làm các bước này)]` : "");
  const r = await askJson(cfg, evalSystem(p, helped.length > 0), [{ role: "user", text: transcript || "(không có hội thoại)" }], evalSchema);
  const cap = helped.length ? scoreCap(cps, revealed) : 3; // chỉ phần tự làm được tính điểm: chốt bằng luật, không phụ thuộc AI chấm
  const c = (n: number) => Math.min(cap, Math.max(0, Math.round(n)));
  r.final_correct = r.final_correct && !(cps.length && revealed >> (cps.length - 1) & 1); // bước kết luận được giải hộ thì không phải tự đi tới kết luận đúng
  const [identify, plan, calculate, explain] = [r.identify, r.plan, r.calculate, r.explain].map(c);
  const bots = msgs.filter((m) => m.role === "bot");
  const maxHint = Math.max(1, ...bots.map((m) => m.hint_level ?? 1));
  const hintCount = bots.filter((m, i) => i > 0 && (m.hint_level ?? 1) > (bots[i - 1].hint_level ?? 1)).length;
  const duration = Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000);
  const total = identify + plan + calculate + explain;
  check(await db.from("session_evals").insert({
    session_id: s.id, identify, plan, calculate, explain, total, final_correct: r.final_correct,
    max_hint_level: maxHint, hint_count: hintCount, errors: r.errors, duration_s: duration, gaps: helped.length ? r.gaps : [],
  } as never));
  check(await db.from("chat_sessions").update({ status: "done", ended_at: new Date().toISOString() } as never).eq("id", s.id));
  await log({ actor: "system", action: "eval_done", teacherId, anonId: s.anon_id, linkId: s.link_id, meta: { total, revealed: helped.length } });
  await log({ actor: "student", action: "chat_session_ended", teacherId, anonId: s.anon_id, linkId: s.link_id });
  if (!helped.length) return;
  const given = [p.data, p.statement];
  return r.review.filter((t) => !leaks(t, p.solution, given, p.solution_steps)); // ôn tập không được lộ đáp án
}

// Lời mở đầu không gọi AI lúc chat: dùng câu chào AI đã tạo sẵn khi nạp đề (p.greeting). Tiết kiệm 1 lượt/phiên.
export async function openingTurn(s: Session, p: Problem) {
  const reply = p.greeting || GREETING_FALLBACK;
  check(await admin().from("messages").insert({ session_id: s.id, role: "bot", content: reply, step: 1, hint_level: 1 } as never));
  return { reply, step: 1, done: false };
}
