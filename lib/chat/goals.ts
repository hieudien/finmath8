import { leaks } from "@/lib/chat/prompt";
import { stripStep } from "@/lib/chat/progress";
import type { Problem } from "@/lib/schema/problem";

// Đề có kết quả chuẩn từng bước (để server chấm) khớp số bước lời giải. Lệch (giáo viên sửa lời giải) thì coi như chưa có.
export const hasChecks = (p: Pick<Problem, "solution_steps" | "step_checks">) =>
  p.solution_steps.length > 0 && p.step_checks.length === p.solution_steps.length;

// Việc học sinh cần làm ở bước i: câu mục tiêu AI viết sẵn, thiếu thì gợi ý mức 1 của bước, thiếu nữa thì rỗng.
// known = số học sinh đã tự tìm ra (bước trước), được nhắc lại; số kết quả khác của lời giải thì bị chặn (leaks) vì học sinh sẽ thấy câu này.
export function stepGoal(p: Problem, i: number, known: unknown[] = []): string {
  const n = p.solution_steps.length;
  const g = (p.step_goals.length === n && p.step_goals[i]) || (p.step_hints.length === n && p.step_hints[i]?.[0]) || "";
  return g && !leaks(g, p.solution, [p.data, p.statement, p.figure?.desc, known], p.solution_steps) ? g : "";
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
  return h && h !== stepGoal(p, i, known) && !leaks(h, p.solution, [p.data, p.statement, p.figure?.desc, known], p.solution_steps) ? h : "";
}

// Lời chào (trình duyệt hiện ngay, server lưu cùng nội dung). Không nêu bước nào: học sinh viết một bước, nhiều bước hoặc cả bài đều được.
export const stepsGreeting = () => "Bạn giải bài vào ô bên dưới: viết một bước, nhiều bước hoặc cả lời giải đều được. Mình sẽ nhận xét bài làm của bạn. Cần gợi ý thì bấm nút Gợi ý nhé.";
