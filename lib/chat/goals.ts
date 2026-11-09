import { leaks } from "@/lib/chat/prompt";
import { QUIZ_GREETING, STEPS_GREETING } from "@/lib/modes";
import type { Problem } from "@/lib/schema/problem";

// Đề có đủ chỉ dẫn từng bước (mục tiêu + gợi ý) khớp số bước lời giải. Lệch (giáo viên sửa lời giải) thì coi như chưa có.
export const hasGuides = (p: Pick<Problem, "solution_steps" | "step_goals" | "step_hints">) =>
  p.solution_steps.length > 0 && p.step_goals.length === p.solution_steps.length && p.step_hints.length === p.solution_steps.length;

// Đề có trắc nghiệm đủ cho mọi bước.
export const hasChoices = (p: Pick<Problem, "solution_steps" | "step_choices">) => p.solution_steps.length > 0 && p.step_choices.length === p.solution_steps.length;

// 4 đáp án của bước i, xáo theo seed (phiên + bước) nên tải lại trang không đổi thứ tự. Không lộ đáp án nào đúng.
export function choiceOptions(p: Pick<Problem, "step_choices">, i: number, seed: string): string[] {
  const c = p.step_choices[i];
  if (!c) return [];
  const o = [c.right, ...c.traps.map((t) => t.text)];
  let h = 2166136261;
  for (const ch of `${seed}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 2 ** 32);
  for (let k = o.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [o[k], o[j]] = [o[j], o[k]]; }
  return o;
}

// Việc học sinh cần làm ở bước i: câu mục tiêu AI viết sẵn, thiếu thì gợi ý mức 1 của bước, thiếu nữa thì rỗng.
// known = số học sinh đã tự tìm ra (bước trước), được nhắc lại; số kết quả khác của lời giải thì bị chặn (leaks) vì học sinh sẽ thấy câu này.
export function stepGoal(p: Problem, i: number, known: unknown[] = []): string {
  const n = p.solution_steps.length;
  const g = (p.step_goals.length === n && p.step_goals[i]) || (p.step_hints.length === n && p.step_hints[i]?.[0]) || "";
  return g && !leaks(g, p.solution, [p.data, p.statement, known], p.solution_steps) ? g : "";
}

// Lời chào kiểu từng bước (trình duyệt hiện ngay, server lưu cùng nội dung): nêu luôn việc của bước 1.
export function stepsGreeting(p: Problem, quiz = false) {
  const g = stepGoal(p, 0);
  const hi = quiz ? QUIZ_GREETING : STEPS_GREETING;
  return g ? `${hi} Bước 1/${p.solution_steps.length}: ${g}` : hi;
}
