import { after } from "next/server";
import { check } from "@/lib/db";
import { admin } from "@/lib/supabase/admin";
import type { LlmCfg } from "@/lib/llm";
import { leaks } from "@/lib/chat/prompt";
import { checkpoints, countDone } from "@/lib/chat/progress";
import { botMsg, finish, withReview, type Session } from "@/lib/chat/engine";
import { revealLine } from "@/lib/chat/assist";
import { closing, closingHelp } from "@/lib/chat/canned";
import { known, nextLine as baseLine, progress, stepNo, struggle } from "@/lib/chat/steps";
import { MAX_WRONG } from "@/lib/modes";
import { log } from "@/lib/log";
import { reportError } from "@/lib/errors";
import type { Problem } from "@/lib/schema/problem";

// Kiểu "trắc nghiệm từng bước": mỗi bước một câu 4 đáp án (1 đúng + 3 bẫy lỗi hay gặp, AI viết sẵn khi giáo viên bấm tạo chỉ dẫn).
// Server tự chấm bằng so khớp chuỗi, không gọi AI khi học sinh làm bài. Gợi ý dùng lại stepHint (lib/chat/steps.ts).
// Chọn sai: hiện lời giải thích lỗi của đáp án đó, cộng chat_sessions.wrong. Đủ MAX_WRONG thì hiện lời giải bước đó (cờ revealed), chống đoán mò.

export const PICK = "[Chọn] "; // tiền tố tin học sinh chọn, để nhật ký giáo viên đọc được

const nextLine = (p: Problem, cps: ReturnType<typeof checkpoints>, mask: number) => baseLine(p, cps, mask, "chọn đáp án đúng nhé.", false);

// Trả null nếu đáp án gửi lên không nằm trong 4 đáp án của bước hiện tại (yêu cầu giả).
export async function quizPick(cfg: LlmCfg, s: Session, p: Problem, choice: string, teacherId: string) {
  const db = admin();
  const cps = checkpoints(p);
  const mask0 = s.progress ?? 0;
  const cur = cps.find((c) => !(mask0 >> c.id & 1));
  const c = cur && p.step_choices[cur.id];
  if (!cur || !c) return null;
  const trap = c.traps.find((t) => t.text === choice);
  if (choice !== c.right && !trap) return null;

  const saveStudent = Promise.resolve(db.from("messages").insert({ session_id: s.id, role: "student", content: PICK + choice } as never)).then(check);
  const right = choice === c.right;
  const wrong = right ? 0 : (s.wrong ?? 0) + 1;
  const reveal = !right && wrong >= MAX_WRONG;
  let mask = mask0, revealed = s.revealed ?? 0, reply = "";
  if (right || reveal) { mask |= 1 << cur.id; if (reveal) revealed |= 1 << cur.id; }
  const finished = countDone(mask) >= cps.length;

  if (!right) {
    // Lời giải thích lỗi do AI viết sẵn: chặn nếu lộ kết quả đúng (số đã có trong đáp án học sinh vừa chọn thì được nhắc).
    const given = [p.data, p.statement, choice, known(cps, mask0)];
    const why = trap && !leaks(trap.why, p.solution, given, p.solution_steps) ? trap.why : "Chưa đúng. Bạn tính lại thật cẩn thận nhé.";
    if (!trap || why !== trap.why) await log({ actor: "system", action: "answer_leak_blocked", teacherId, anonId: s.anon_id, linkId: s.link_id });
    reply = reveal ? `${why} ${revealLine(cur, cps.length)}` : `${why} Bạn thử chọn lại nhé.`;
  }
  if (finished) reply = revealed ? `${right ? "" : reply + " "}${closingHelp()}`.trim() : closing();
  else if (right) reply = `Đúng rồi! ${nextLine(p, cps, mask)}`;
  else if (reveal) reply = `${reply} ${nextLine(p, cps, mask)}`;

  if (finished && revealed) reply = await withReview(cfg, s, p, teacherId, revealed, reply);
  await saveStudent;
  const step = finished ? 5 : stepNo(cps, mask);
  const moved = mask !== mask0;
  const hl = moved ? 0 : s.hint_level;
  await Promise.all([
    botMsg(s.id, { content: reply, step, hint_level: hl, kind: finished ? "done" : right ? "right" : reveal ? "reveal" : "wrong" }).then(check),
    db.from("chat_sessions").update({ step, progress: mask, hint_level: hl, wrong: moved ? 0 : wrong, ...(moved && { stall: 0 }), revealed, ...(!right && { struggled: struggle(s, cur) }) } as never).eq("id", s.id).then(check),
  ]);
  if (finished) after(() => finish(cfg, s, p, teacherId).catch((e) => reportError(e, "chấm điểm (finish)", { teacherId, linkId: s.link_id, anonId: s.anon_id, actor: "system" })));
  return { reply, step, done: finished, ok: right, progress: progress(p, cps, mask, s) };
}
