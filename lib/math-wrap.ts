// Giá trị dữ kiện/đáp án là LaTeX trần (\frac{4}{x+y} = 5) thì bọc $...$ để MathText dựng công thức.
// Đã có $ thì giữ nguyên. Chuỗi lẫn chữ tiếng Việt có dấu thì không bọc cả chuỗi (chữ sẽ thành chữ toán, mất khoảng trắng).
const LATEX = /\\[A-Za-z]{2,}|[\^_]\{/;
const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const FRAC = /^\s*(-?)(\d+)\s*\/\s*(\d+)\s*$/;

export const wrapMath = (s: string): string => {
  const f = s.match(FRAC);
  if (f && Number(f[3])) return `$${f[1]}\\frac{${f[2]}}{${f[3]}}$`; // "2/5" thành phân số dựng sẵn
  if (s.includes("$") || !LATEX.test(s) || VI.test(s)) return s;
  return `$${s.trim()}$`;
};

// Áp wrapMath lên mọi giá trị chuỗi của một bản ghi dữ kiện/đáp án (số giữ nguyên).
export const wrapRecord = (r: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" ? wrapMath(v) : v]));
