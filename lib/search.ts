// Tìm theo chữ: bỏ dấu tiếng Việt, không phân biệt hoa thường; nhiều từ thì phải khớp hết (AND).
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

export function matchText(hay: string, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const h = fold(hay);
  return words.every((w) => h.includes(w));
}
