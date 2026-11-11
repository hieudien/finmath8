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

// Trình bày chữ cho gọn, không đụng công thức: che $...$ bằng ký hiệu giữ chỗ, sửa chữ thường, trả công thức về.
// Công thức $...$ có thể xuống dòng bên trong (model hay viết hệ phương trình nhiều dòng): xuống dòng đó đổi thành khoảng trắng.
// Dấu . , ; liền sau công thức đi theo công thức, để khi tách công thức ra dòng riêng dấu câu không rơi xuống dòng sau.
const MATH = /(?:\$\$[\s\S]+?\$\$|\$[^$]+?\$)[.,;]?/g;
const NUL = code(0);
// own: công thức hệ phương trình (\begin{cases}) đứng riêng một dòng.
function onText(s: string, f: (t: string) => string, own = false): string {
  const m: string[] = [];
  const masked = s.replace(MATH, (x) => {
    m.push(x.startsWith("$$") ? x : x.replace(/\s*\n\s*/g, " "));
    const ph = `${NUL}${m.length - 1}${NUL}`;
    return own && x.includes("begin{cases}") ? `${NL}${ph}${NL}` : ph;
  });
  return f(masked).replace(new RegExp(`${NUL}(\\d+)${NUL}`, "g"), (_, i) => m[Number(i)]);
}

// Dãy ý a) b) hoặc 1) 2): chỉ coi là danh sách ý khi có ít nhất hai ý liên tiếp; "ở câu a)" nhắc lại thì không ngắt.
const SEQ: [string, string][] = [["[a-e]", "a"], ["\\d{1,2}", "1"]];
const REF = /^(câu|ý|phần|mục|bài|ở|của|theo)$/i;
function breakItems(t: string): string {
  for (const [any, first] of SEQ) {
    const second = first === "a" ? "b" : "2";
    if (!new RegExp(`(^|\\s)${first}\\)\\s`).test(t) || !new RegExp(`\\s${second}\\)\\s`).test(t)) continue;
    t = t.replace(new RegExp(`(\\S+)[ \\t]+(${any}\\))(?=\\s)`, "g"), (m, prev: string, item: string) => (REF.test(prev) ? m : `${prev}${NL}${item}`));
  }
  return t;
}

// Đề bài: mỗi ý a), b), 1), 2) hoặc "Câu N" một dòng, hệ phương trình một dòng riêng, gọn khoảng trắng và dòng trống.
export const tidyStatement = (s: string) => onText(s.replace(/\r\n?/g, NL), (t) => breakItems(t)
  .replace(/([.:;?!])[ \t]+((?:[a-e]|\d{1,2})\))(?=\s)/g, `$1${NL}$2`)
  .replace(/[ \t]+(?=Câu \d+\s*[.:])/g, NL)
  .split(NL).map((l) => l.replace(/[ \t]+/g, " ").trim()).join(NL).replace(/\n{3,}/g, NL + NL).trim(), true);

// Một câu (bước lời giải, gợi ý, sai lầm...): gọn khoảng trắng; câu trơn kết thúc bằng chữ, số hoặc công thức thì thêm dấu chấm.
export const tidyLine = (s: string) => onText(s, (t) => t.split(NL).map((l) => l.replace(/[ \t]+/g, " ").trim()).join(NL).trim())
  .replace(/([\p{L}\d)]|[^$]\$)$/u, "$1.");

const tidyAll = (p: Problem): Problem => {
  const q = { ...p, statement: tidyStatement(p.statement), solution_steps: p.solution_steps.map(tidyLine), common_errors: p.common_errors.map(tidyLine), extension: tidyLine(p.extension), hints: p.hints.map((h) => ({ ...h, text: tidyLine(h.text) })) };
  return JSON.stringify(q) === JSON.stringify(p) ? p : q;
};

export function repairProblem(p: Problem): Problem {
  return tidyAll(repairSteps(p));
}

function repairSteps(p: Problem): Problem {
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
