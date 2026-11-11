// JSON viết \times \frac \begin \right \neq với MỘT dấu gạch chéo thì bị nuốt thành tab, form feed, backspace, CR, xuống dòng.
// Sửa không cần AI: trả ký tự điều khiển về lệnh LaTeX. Dùng cho đề, lời giải, gợi ý và chỉ dẫn từng bước. Không import gì để tránh vòng lặp import.
const BS = String.fromCharCode(92);
const code = String.fromCharCode;
const NL = code(10);
const nlLatex = new RegExp(`${NL}(?=(eq|e |ot|eg|abla|mid|subset))`, "g"); // \neq, \ne, \not, \neg, \nabla, \nmid, \nsubset
const nlEnd = new RegExp(`${NL}(?=end\\{)`, "g"); // \end{cases}: dấu \ bị nuốt cùng chữ e

export const fixStr = (s: string) => {
  const t = s.replace(/\t(?=[A-Za-z])/g, BS + "t").split(code(12)).join(BS + "f").split(code(8)).join(BS + "b").replace(/\r(?=[A-Za-z])/g, BS + "r").split(code(11)).join(BS + "v")
    .split(code(7)).join(BS + "a") // \alpha, \approx, \angle: dấu \ bị nuốt thành ký tự chuông
    .replace(nlLatex, BS + "n").replace(nlEnd, BS);
  // Model đôi khi viết \begin{cases} ở chỗ đáng lẽ là \end{cases}: hai \begin liền nhau không có \end ở giữa thì cái sau là \end.
  const closed = t.includes("cases}") ? t.replace(/(\\begin\{cases\}(?:(?!\\end\{cases\})[\s\S])*?)\\begin\{cases\}/g, (_, head: string) => `${head}${BS}end{cases}`) : t;
  // Hệ cases: "\\" ngăn hàng bị mất một dấu thành "\ ", và "\end" thành "\ end" (hoặc "end").
  return closed.includes("cases}") ? closed.replace(/\\begin\{cases\}([\s\S]*?)(?:\\\s*)?end\{cases\}/g, (_, body: string) => `${BS}begin{cases}${body.replace(/\\{1,2}(?=\s)/g, BS + BS).trimEnd()} ${BS}end{cases}`) : closed;
};

// Áp fixStr lên mọi chuỗi trong một giá trị lồng nhau (mảng, đối tượng).
export const walk = (v: unknown): unknown => typeof v === "string" ? fixStr(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
