import { leaks } from "@/lib/chat/prompt";
import { stripStep } from "@/lib/chat/progress";
import type { Problem } from "@/lib/schema/problem";

// Đề có đủ chỉ dẫn từng bước (mục tiêu + gợi ý) khớp số bước lời giải. Lệch (giáo viên sửa lời giải) thì coi như chưa có.
export const hasGuides = (p: Pick<Problem, "solution_steps" | "step_goals" | "step_hints">) =>
  p.solution_steps.length > 0 && p.step_goals.length === p.solution_steps.length && p.step_hints.length === p.solution_steps.length;

// Việc học sinh cần làm ở bước i: câu mục tiêu AI viết sẵn, thiếu thì gợi ý mức 1 của bước, thiếu nữa thì rỗng.
// known = số học sinh đã tự tìm ra (bước trước), được nhắc lại; số kết quả khác của lời giải thì bị chặn (leaks) vì học sinh sẽ thấy câu này.
export function stepGoal(p: Problem, i: number, known: unknown[] = []): string {
  const n = p.solution_steps.length;
  const g = (p.step_goals.length === n && p.step_goals[i]) || (p.step_hints.length === n && p.step_hints[i]?.[0]) || "";
  return g && !leaks(g, p.solution, [p.data, p.statement, known], p.solution_steps) ? g : "";
}

// Như stepGoal nhưng không bao giờ rỗng khi đề có lời giải: thiếu mục tiêu thì lấy lời giải bước đó, thay mọi số bằng "…" (không lộ kết quả).
export function stepCue(p: Problem, i: number, known: unknown[] = []): string {
  const g = stepGoal(p, i, known);
  if (g) return g;
  const t = p.solution_steps[i];
  return t ? stripStep(t).replace(/\d[\d.,]*(?![\d.,\p{L}])/gu, "…").trim() : "";
}

// Định hướng nhẹ cho bước i (gợi ý mức 1 của đề, đã qua kiểm tra lộ đáp án). Rỗng nếu đề không có hoặc trùng với việc cần làm.
export function stepLead(p: Problem, i: number, known: unknown[] = []): string {
  const n = p.solution_steps.length;
  const h = (p.step_hints.length === n && p.step_hints[i]?.[0]) || "";
  return h && h !== stepGoal(p, i, known) && !leaks(h, p.solution, [p.data, p.statement, known], p.solution_steps) ? h : "";
}

// Dạng cần viết ở bước i và ví dụ cách viết: AI viết sẵn lúc chuẩn hóa. Rỗng nếu đề chưa có, lệch số bước, hoặc lộ kết quả.
const guideText = (list: string[], p: Problem, i: number, known: unknown[]) => {
  const g = (list.length === p.solution_steps.length && list[i]) || "";
  return g && !leaks(g, p.solution, [p.data, p.statement, known], p.solution_steps) ? g : "";
};
export const stepFormat = (p: Problem, i: number, known: unknown[] = []) => guideText(p.step_formats, p, i, known);
export const stepExample = (p: Problem, i: number, known: unknown[] = []) => guideText(p.step_examples, p, i, known);

const STEPS_GREETING = "Bạn viết từng bước giải vào ô bên dưới, mỗi lần một bước. Mình sẽ kiểm tra từng bước. Cần gợi ý thì bấm nút Gợi ý nhé.";

// Lời chào kiểu từng bước (trình duyệt hiện ngay, server lưu cùng nội dung): nêu luôn việc của bước 1.
export function stepsGreeting(p: Problem) {
  const g = stepCue(p, 0);
  return g ? `${STEPS_GREETING} Bước 1/${p.solution_steps.length}: ${g}` : STEPS_GREETING;
}
