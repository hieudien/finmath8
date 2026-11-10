import { canon } from "@/lib/answer-check";
import { hasNum, hasWord, met, numsIn, type Cp } from "@/lib/chat/progress";
import { leaks } from "@/lib/chat/prompt";
import type { Problem } from "@/lib/schema/problem";

const plainNum = (x: string) => /^[-+]?[\d.,\s]+%?$/.test(x.trim());

// Học sinh nộp đúng một kết quả sai đã biết của bước hiện tại (p.error_traps): trả lời giải thích lỗi AI viết sẵn, không gọi AI lúc chat.
// Bỏ qua khi tin cũng có kết quả đúng của bước, khi kết quả sai chỉ là số đề cho, hoặc khi lời giải thích lộ số kết quả (known = số học sinh đã tự tìm ra).
export function trapReply(p: Problem, cp: Cp, text: string, known: unknown[]): string {
  if (met(cp, text)) return "";
  const given = new Set(numsIn(JSON.stringify([p.data, p.statement ?? ""])));
  for (const t of p.error_traps) {
    if (t.step !== cp.id + 1) continue;
    const ns = numsIn(t.wrong);
    const num = plainNum(t.wrong) && ns.length > 0;
    if (num ? ns.every((n) => given.has(n)) : canon(t.wrong).length < 2) continue;
    if (!(num ? ns.every((n) => hasNum(text, n)) : hasWord(text, canon(t.wrong)))) continue;
    if (leaks(t.why, p.solution, [p.data, p.statement, text, known], p.solution_steps)) continue;
    return t.why;
  }
  return "";
}
