import { texts as textVals } from "@/lib/answer-check";
import { stripStep } from "@/lib/chat/progress";
import { aboveGrade } from "@/lib/grade";
import type { Problem } from "@/lib/schema/problem";

const list = (xs: number[]) => xs.map((n) => n + 1).join(", ");

// Bước chỉ mô tả cách làm (không có chữ số lẫn dấu "="): học sinh viết thẳng phép tính thì không khớp bước này và bị kẹt chuỗi bước có số phía sau.
// Bỏ qua bước cuối và các bước mở đầu bằng "Vậy/Kết luận/Do đó" (kết luận chữ là bình thường); đề không có số nào thì không xét.
// Trả chỉ số (0-based). Không nằm trong lintProblem vì lint chặn lưu đề; chuẩn hóa chỉ dùng để viết lại lời giải một lần.
export function descriptiveSteps(p: Pick<Problem, "solution_steps" | "statement">): number[] {
  if (!/\d/.test(p.statement ?? "")) return [];
  return p.solution_steps.flatMap((s, i) => {
    const t = stripStep(s);
    return i < p.solution_steps.length - 1 && !/\d|[=＝]/.test(t) && !/^(vậy|kết luận|do đó|suy ra)\b/i.test(t.trim()) ? [i] : [];
  });
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const MOJIBAKE = /[ÄÅÃŰŐ]/; // chữ lạ do lỗi mã hóa (vd "Äng thŰơc"): tiếng Việt đúng không có các ký tự này

// Lỗi NẶNG của đề (kiểm bằng code, không gọi AI): đề có lỗi này thì bot chấm sai hoặc khen nhầm nên KHÔNG được duyệt, khóa đáp án hay đưa vào liên kết.
// Khác lintProblem (chỉ cảnh báo). Rỗng = không có lỗi nặng.
export function blockers(p: Problem): string[] {
  const out: string[] = [];
  const bad = [["đề bài", p.statement], ...p.solution_steps.map((t, i) => [`lời giải bước ${i + 1}`, t]), ...p.hints.map((h, i) => [`gợi ý mức ${i + 1}`, h.text]), ...p.step_goals.map((t, i) => [`mục tiêu bước ${i + 1}`, t])].filter(([, t]) => MOJIBAKE.test(t)).map(([w]) => w);
  if (bad.length) out.push(`Chữ bị lỗi mã hóa (ký tự lạ như "Ä", "Ű") trong ${bad.slice(0, 4).join(", ")}${bad.length > 4 ? "..." : ""}: viết lại cho đúng.`);
  const st = fold(p.statement ?? "");
  // Hai luật dưới chỉ áp cho đề điền chỗ trống (có "......"): đề chọn phương án ("cửa hàng B") hay lặp kết quả ở bước kết luận là bình thường.
  if (!/\.{4,}|…{2,}|_{3,}/.test(p.statement ?? "")) return out;
  // Kết quả chuẩn / đáp án chữ nhiều từ mà đã có sẵn trong đề bài: đó là phần đề cho, không phải chỗ học sinh phải điền (bot sẽ nhận nhầm).
  const given = (t: string) => { const f = fold(t); return f.split(" ").length >= 2 && !/\d/.test(f) && ` ${st} `.includes(` ${f} `); };
  const keyed = [...p.step_checks.flatMap((c) => [c.result, ...c.accepts]), ...textVals(p.solution)].filter(given);
  if (keyed.length) out.push(`Đáp án hoặc kết quả chuẩn "${keyed[0].slice(0, 60)}" đã có sẵn trong đề bài: đó là phần đề cho, không phải chỗ học sinh cần làm. Sửa lại đáp án.`);
  // Hai bước có cùng kết quả chuẩn: học sinh làm xong cả hai chỉ bằng một câu, bot khen "xong" mà bước sau không có việc riêng.
  if (p.step_checks.length === p.solution_steps.length && p.step_checks.length > 1) {
    const seen = new Map<string, number>();
    for (const [i, c] of p.step_checks.entries()) {
      const f = fold(c.result);
      if (!f) continue;
      if (seen.has(f)) { out.push(`Bước ${seen.get(f)! + 1} và bước ${i + 1} có cùng kết quả chuẩn "${c.result.slice(0, 40)}": gộp thành một bước hoặc sửa lại.`); break; }
      seen.set(f, i);
    }
  }
  return out;
}

// Kiểm đề bằng code (không gọi AI): chỉ ra chỗ khiến phản hồi của bot kém ổn định hoặc có thể lộ đáp án. Chỉ cảnh báo, không chặn liên kết.
export function lintProblem(p: Problem): string[] {
  const out: string[] = [];
  if (!p.step_checks.length && textVals(p.solution).length) out.push("Đáp án có phần chữ hoặc biểu thức: chưa có kết quả chuẩn từng bước để chấm và chặn lộ. Bấm chuẩn hóa lại đề.");
  // JSON viết \times \frac \begin \neq với MỘT dấu gạch chéo thì thành tab, form feed, backspace, xuống dòng: công thức mất chữ, lời giải bị cắt vụn.
  // Nêu rõ chỗ nào hỏng để giáo viên biết sửa ở ô nào.
  const CTRL = /[\t\f\b\v\r\x07]/;
  const where = [
    CTRL.test(p.statement ?? "") ? "đề bài" : "",
    ...p.solution_steps.map((t, i) => (CTRL.test(t) ? `lời giải bước ${i + 1}` : "")),
    ...p.hints.map((h, i) => (CTRL.test(h.text) ? `gợi ý mức ${i + 1}` : "")),
  ].filter(Boolean);
  if (where.length) out.push(`Có ký tự điều khiển (tab, xuống dòng lạ) trong ${where.slice(0, 4).join(", ")}${where.length > 4 ? "..." : ""}: thường do JSON viết \\times, \\frac, \\begin, \\neq chỉ với một dấu \\. Viết lại thành \\\\times, \\\\frac...`);
  const loose = p.solution_steps.map((s, i) => (i > 0 && !/^Bước \d/.test(s) ? i + 1 : 0)).filter(Boolean);
  if (loose.length && p.solution_steps.filter((s) => /^Bước \d/.test(s)).length >= p.solution_steps.length / 2) out.push(`Bước ${list(loose.map((n) => n - 1))} không mở đầu bằng "Bước N": có thể một bước bị cắt thành nhiều mảnh (thường do dấu \\n trong công thức).`);
  if (p.solution_steps.length === 1) out.push("Lời giải chỉ có 1 bước nên chưa đủ chi tiết để bot nhận xét. Bấm chuẩn hóa lại để AI viết lời giải chi tiết.");
  if (p.solution_steps.some((s) => stripStep(s) !== s)) out.push('Lời giải còn tiền tố "Bước N:" trong chữ: giao diện đã tự đánh số nên bị lặp. Bấm chuẩn hóa.');
  out.push(...aboveGrade(p));
  if (!p.solution_steps.length) return out;
  return out;
}
