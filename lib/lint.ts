import { texts as textVals } from "@/lib/answer-check";
import { checkpoints, stripStep } from "@/lib/chat/progress";
import { leaks } from "@/lib/chat/prompt";
import { aboveGrade } from "@/lib/grade";
import type { Problem } from "@/lib/schema/problem";

const list = (xs: number[]) => xs.map((n) => n + 1).join(", ");

// Kiểm đề bằng code (không gọi AI): chỉ ra chỗ khiến phản hồi của bot kém ổn định hoặc có thể lộ đáp án. Chỉ cảnh báo, không chặn liên kết.
export function lintProblem(p: Problem): string[] {
  const out: string[] = [];
  if (!p.step_checks.length && textVals(p.solution).length) out.push("Đáp án có phần chữ hoặc biểu thức: chưa có kết quả chuẩn từng bước để chấm và chặn lộ. Bấm tạo lại chỉ dẫn từng bước.");
  // JSON viết \times \frac \begin \neq với MỘT dấu gạch chéo thì thành tab, form feed, backspace, xuống dòng: công thức mất chữ, lời giải bị cắt vụn.
  // Nêu rõ chỗ nào hỏng để giáo viên biết sửa ở ô nào.
  const CTRL = /[\t\f\b\v\r\x07]/;
  const where = [
    CTRL.test(p.statement ?? "") ? "đề bài" : "",
    ...p.solution_steps.map((t, i) => (CTRL.test(t) ? `lời giải bước ${i + 1}` : "")),
    ...p.hints.map((h, i) => (CTRL.test(h.text) ? `gợi ý mức ${i + 1}` : "")),
    ...p.step_hints.flatMap((hs, i) => (hs.some((t) => CTRL.test(t)) ? [`chỉ dẫn bước ${i + 1}`] : [])),
  ].filter(Boolean);
  if (where.length) out.push(`Có ký tự điều khiển (tab, xuống dòng lạ) trong ${where.slice(0, 4).join(", ")}${where.length > 4 ? "..." : ""}: thường do JSON viết \\times, \\frac, \\begin, \\neq chỉ với một dấu \\. Viết lại thành \\\\times, \\\\frac...`);
  const loose = p.solution_steps.map((s, i) => (i > 0 && !/^Bước \d/.test(s) ? i + 1 : 0)).filter(Boolean);
  if (loose.length && p.solution_steps.filter((s) => /^Bước \d/.test(s)).length >= p.solution_steps.length / 2) out.push(`Bước ${list(loose.map((n) => n - 1))} không mở đầu bằng "Bước N": có thể một bước bị cắt thành nhiều mảnh (thường do dấu \\n trong công thức).`);
  if (p.solution_steps.length === 1) out.push("Lời giải chỉ có 1 bước nên bot không chia được từng bước. Bấm tạo lại lời giải.");
  if (p.solution_steps.some((s) => stripStep(s) !== s)) out.push('Lời giải còn tiền tố "Bước N:" trong chữ: giao diện đã tự đánh số nên bị lặp. Bấm chuẩn hóa.');
  out.push(...aboveGrade(p));
  if (!p.solution_steps.length) return out;
  const cps = checkpoints(p);
  const known = (i: number) => cps.slice(0, i).map((c) => c.must);
  const given = (i: number, ...more: unknown[]) => [p.data, p.statement, known(i), ...more];
  const n = p.solution_steps.length;
  if ((p.step_goals.length || p.step_hints.length) && !(p.step_goals.length === n && p.step_hints.length === n)) out.push("Chỉ dẫn từng bước lệch số bước lời giải nên không được dùng. Bấm tạo lại chỉ dẫn.");
  const leakGoal = p.step_goals.length === n ? p.step_goals.flatMap((g, i) => (g && leaks(g, p.solution, given(i), p.solution_steps) ? [i] : [])) : [];
  if (leakGoal.length) out.push(`Mục tiêu bước ${list(leakGoal)} nêu kết quả (học sinh sẽ không thấy câu này).`);
  const leakHint = p.step_hints.length === n ? p.step_hints.flatMap((hs, i) => (hs.some((h) => leaks(h, p.solution, given(i), p.solution_steps)) ? [i] : [])) : [];
  if (leakHint.length) out.push(`Gợi ý riêng của bước ${list(leakHint)} nêu kết quả (server sẽ thay bằng gợi ý chung).`);
  return out;
}
