import { withGuides } from "@/lib/step-guides";
import { stripStep } from "@/lib/chat/progress";
import { walk } from "@/lib/latex-fix";
import type { Problem } from "@/lib/schema/problem";

// Sửa ký tự điều khiển do JSON nuốt dấu gạch chéo ngược nằm ở lib/latex-fix.ts (dùng chung với chỉ dẫn từng bước).
const code = String.fromCharCode;
const NL = code(10);
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
  const masked = s.replace(MATH, (x, off: number) => {
    m.push(x.startsWith("$$") ? x : x.replace(/\s*\n\s*/g, " "));
    const ph = `${NUL}${m.length - 1}${NUL}`;
    if (!(own && x.includes("begin{cases}"))) return ph;
    // Sau hệ còn chữ cùng dòng ("(I) (m là tham số)") mà không phải nhãn ý a), 1): giữ hệ cùng dòng như đề gốc (KaTeX inline tự căn giữa dọc).
    const next = s.slice(off + x.length).match(/^[ \t]*(\S+)/)?.[1];
    const inline = !!next && !/^(?:[a-e]|\d{1,2})\)/.test(next) && !/^[.,;:]+$/.test(next);
    return inline ? ph : `${NL}${ph}${NL}`;
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

// Công thức LaTeX còn trần (model quên $...$): bọc lại để giao diện dựng đúng thay vì hiện \frac, \left thô.
// Chỉ bọc đoạn có lệnh \xxx; chữ thường (từ có dấu hoặc từ từ 2 chữ cái trở lên) làm đứt đoạn. Chạy trên chữ đã che công thức $...$.
const SOH = code(1);
const SEP = code(2);
const bareOk = (w: string) => {
  const c = w.replace(/[.,;:]+$/, "");
  return !!c && /^[\x21-\x7E]+$/.test(c) && !c.includes("$") && !/[A-Za-z]{2}/.test(c.replace(/\\[A-Za-z]+/g, ""));
};
function wrapBare(t: string): string {
  const stash: string[] = [];
  const s = t.replace(/\\begin\{cases\}[\s\S]*?\\end\{cases\}/g, (m) => { stash.push(`$${m.replace(/\s*\n\s*/g, " ")}$`); return `${SOH}${stash.length - 1}${SOH}`; })
    // Ngoài công thức không có dấu \ hợp lệ nào ngoài lệnh LaTeX (\frac...): "\a)" đổi thành "a)", "\ " hay "\" cuối dòng (dấu ngắt dòng lạc) bị bỏ.
    .replace(/¦/g, "").replace(/\\(?=(?:[a-e]|\d{1,2})\)(?:\s|$))/g, "").replace(/\\(?![A-Za-z])/g, "");
  const p = s.split(/([ \t]+|\n)/); // chẵn: từ, lẻ: khoảng trắng
  let out = "";
  for (let i = 0; i < p.length; ) {
    if (i % 2 || !bareOk(p[i])) { out += p[i]; i++; continue; }
    let e = i;
    while (e + 2 < p.length && p[e + 1] !== NL && bareOk(p[e + 2])) e += 2;
    const run = p.slice(i, e + 1).join("");
    const [, body, punct] = run.match(/^([\s\S]*?)([.,;:]*)$/)!;
    out += /\\[A-Za-z]/.test(body) ? `$${body}$${punct}` : run;
    i = e + 1;
  }
  return out.replace(new RegExp(`${SOH}(\\d+)${SOH}`, "g"), (_, i) => stash[Number(i)]);
}
// Đề bài: mỗi ý a), b), 1), 2) hoặc "Câu N" một dòng, hệ phương trình một dòng riêng, gọn khoảng trắng và dòng trống.
export const tidyStatement = (s: string) => onText(s.replace(/\r\n?/g, NL), (t) => breakItems(wrapBare(t))
  .replace(/([.:;?!])[ \t]+((?:[a-e]|\d{1,2})\))(?=\s)/g, `$1${NL}$2`)
  .replace(/[ \t]+(?=Câu \d+\s*[.:])/g, NL)
  .split(NL).map((l) => l.replace(/[ \t]+/g, " ").trim()).join(NL).replace(/\n{3,}/g, NL + NL).trim(), true);

// Một câu (bước lời giải, gợi ý, sai lầm...): gọn khoảng trắng; câu trơn kết thúc bằng chữ, số hoặc công thức thì thêm dấu chấm.
export const tidyLine = (s: string) => onText(s, (t) => wrapBare(t).split(NL).map((l) => l.replace(/[ \t]+/g, " ").trim()).join(NL).trim())
  .replace(/([\p{L}\d)]|[^$.?!,;:]\$)$/u, "$1."); // công thức cuối dòng đã kết thúc bằng dấu câu ("...(2; 1).$") thì không thêm dấu chấm nữa

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
  const q0 = walk({ ...p, solution_steps: steps }) as Problem;
  // Một phần tử chứa nhiều dòng (model gộp cả lời giải vào một chuỗi): mỗi dòng ngoài $...$ là một bước. Sau walk nên "\neq" đã được trả về đúng.
  const q = { ...q0, solution_steps: q0.solution_steps.flatMap((s) => onText(s, (t) => t.replace(/[ \t]*\n\s*/g, SEP)).split(SEP).filter((x) => x.trim())) };
  // Lưu chữ sạch, không "Bước N:": giao diện và bot tự đánh số. Chỉ đổi số bước hoặc chữ thật mới làm chỉ dẫn cũ lệch; bỏ tiền tố thì giữ chỉ dẫn.
  const clean = { ...q, solution_steps: q.solution_steps.map(stripStep) };
  if (JSON.stringify(clean) === JSON.stringify(p)) return p;
  return JSON.stringify(q.solution_steps) === JSON.stringify(p.solution_steps) ? clean : withGuides(clean, null);
}
