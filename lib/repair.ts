import { withGuides } from "@/lib/step-guides";
import { stripStep } from "@/lib/chat/progress";
import type { Problem } from "@/lib/schema/problem";

// JSON viết \times \frac \begin \right \neq với MỘT dấu gạch chéo thì bị nuốt thành tab, form feed, backspace, CR, xuống dòng.
// Sửa không cần AI: trả ký tự điều khiển về lệnh LaTeX, nối lại bước bị cắt vụn. Đề lành thì trả đúng đối tượng cũ.
const BS = String.fromCharCode(92);
const code = String.fromCharCode;
const NL = code(10);
const nlLatex = new RegExp(`${NL}(?=(eq|e |ot|eg|abla|mid|subset))`, "g"); // \neq, \ne, \not, \neg, \nabla, \nmid, \nsubset
const nlEnd = new RegExp(`${NL}(?=end\\{)`, "g"); // \end{cases}: dấu \ bị nuốt cùng chữ e
const fixStr = (s: string) => {
  const t = s.replace(/\t(?=[A-Za-z])/g, BS + "t").split(code(12)).join(BS + "f").split(code(8)).join(BS + "b").replace(/\r(?=[A-Za-z])/g, BS + "r").split(code(11)).join(BS + "v")
    .replace(nlLatex, BS + "n").replace(nlEnd, BS);
  // Xuống dòng trong cases: "\\" bị mất một dấu thành "\ ".
  return t.includes("cases}") && !t.includes(BS + BS) ? t.split(BS + " ").join(BS + BS + " ") : t;
};
const walk = (v: unknown): unknown => typeof v === "string" ? fixStr(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
const isStep = (s: string) => /^Bước \d/.test(s);

// Một phần tử chứa nhiều "Bước N:" (AI hoặc giáo viên gộp cả lời giải vào một chuỗi) thì tách ra từng bước.
const MARK = /Bước \d+\s*[:.]\s/g;
const split = (s: string) => ((s.match(MARK) ?? []).length >= 2 ? s.split(/\s*(?=Bước \d+\s*[:.]\s)/).filter(Boolean) : [s]);

export function repairProblem(p: Problem): Problem {
  let steps = p.solution_steps;
  // Phần lớn bước mở đầu bằng "Bước N": phần tử nào không mở đầu thế là mảnh vỡ của bước trước, nối lại qua dấu xuống dòng gốc.
  if (steps.filter(isStep).length >= steps.length / 2) steps = steps.reduce<string[]>((o, s, i) => { if (i > 0 && !isStep(s)) o[o.length - 1] += NL + s; else o.push(s); return o; }, []);
  steps = steps.flatMap(split);
  const q = walk({ ...p, solution_steps: steps }) as Problem;
  // Lưu chữ sạch, không "Bước N:": giao diện và bot tự đánh số. Chỉ đổi số bước hoặc chữ thật mới làm chỉ dẫn cũ lệch; bỏ tiền tố thì giữ chỉ dẫn.
  const clean = { ...q, solution_steps: q.solution_steps.map(stripStep) };
  if (JSON.stringify(clean) === JSON.stringify(p)) return p;
  return JSON.stringify(q.solution_steps) === JSON.stringify(p.solution_steps) ? clean : withGuides(clean, null);
}
