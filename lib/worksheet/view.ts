import { checkpoints, stripStep } from "@/lib/chat/progress";
import { leaks } from "@/lib/chat/prompt";
import { stepCue, stepExample, stepFormat } from "@/lib/chat/goals";
import type { Problem } from "@/lib/schema/problem";

// Dữ liệu gửi xuống trình duyệt cho chế độ "làm theo bước rồi nộp cả bài". Chỉ có đề và hướng dẫn từng bước đã qua kiểm tra lộ đáp án.
// KHÔNG có lời giải, kết quả chuẩn hay gợi ý (gợi ý và đáp án tải theo từng lần bấm để ghi nhận).
export type WsStep = { goal: string; format: string; example: string };
export type WsProblem = { id: string; title: string; statement: string; steps: WsStep[] };

export const wsView = (p: Problem): WsProblem => ({
  id: p.id,
  title: p.title,
  statement: p.statement ?? "",
  steps: checkpoints(p).map((c) => ({ goal: stepCue(p, c.id), format: stepFormat(p, c.id), example: stepExample(p, c.id) })),
});

export const HINT_LEVELS = 3;
const GENERIC = "Bạn đọc lại đề, xem đã biết những gì và cần tìm gì, rồi chọn phép tính cho bước này nhé.";

// Gợi ý mức 1-3 của bước i (0-based), cùng thang với chế độ chat: 1 = chỉ rõ vấn đề, 2 = chia nhỏ thành việc con, 3 = ví dụ tương tự với số khác.
// Ưu tiên dữ liệu AI viết sẵn riêng bước, thiếu thì gợi ý chung của đề cùng mức; gợi ý nào lộ số kết quả thì bỏ.
export function wsHint(p: Problem, i: number, level: number): string {
  const n = p.solution_steps.length;
  const lv = Math.min(HINT_LEVELS, Math.max(1, Math.round(level)));
  const hints = p.step_hints.length === n ? p.step_hints[i] : undefined;
  const subs = p.step_subs.length === n ? p.step_subs[i] : undefined;
  const analog = p.step_analog.length === n ? p.step_analog[i] : "";
  const rung = lv === 2 && subs?.length ? `Chia nhỏ bước này thành mấy việc: ${subs.map((q, k) => `(${k + 1}) ${q}`).join(" ")}` : lv === 3 && analog ? `Thử một ví dụ tương tự với số khác: ${analog}` : "";
  const given = [p.data, p.statement];
  return [rung, hints?.[lv - 1], p.hints.find((h) => h.level === lv)?.text].find((t) => t && !leaks(t, p.solution, given, p.solution_steps)) ?? GENERIC;
}

// Lời giải của bước i (đáp án để học sinh xem khi bấm "Xem đáp án").
export const wsAnswer = (p: Problem, i: number) => { const c = checkpoints(p)[i]; return c ? stripStep(c.label) : ""; };
