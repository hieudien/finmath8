// Số lớn (>= 100) trong đáp án phải xuất hiện nguyên vẹn trong lời giải; trả về các số thiếu.
function nums(v: unknown, out: number[] = []): number[] {
  if (typeof v === "number") out.push(v);
  else if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) out.push(Number(v));
  else if (Array.isArray(v)) v.forEach((x) => nums(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => nums(x, out)); // chỉ giá trị, không lấy tên khóa
  return out;
}

export function missingAnswers(solution: unknown, steps: string[]): string[] {
  const raw = steps.join(" ");
  // Bỏ dấu ngăn nghìn kiểu Việt (2.400.000 / 2 400 000) và đổi dấu phẩy thập phân.
  const norm = raw.replace(/(?<=\d)[.\s](?=\d{3}(?!\d))/g, "").replace(/(?<=\d),(?=\d)/g, ".");
  const has = (t: string, n: string) => new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?![\\d])`).test(t);
  const need = [...new Set(nums(solution).filter((n) => Math.abs(n) >= 100).map((n) => String(Math.abs(n))))];
  return need.filter((n) => !has(norm, n) && !has(raw, n));
}
