import katex from "katex";

// Kiểm tra kết quả đọc ảnh đề: chỉ bắt lỗi hình thức (công thức vỡ, hệ thiếu ngăn hàng, lẫn lời giải vào đề), không biết đọc có đúng nội dung ảnh không.
// Chạy trên chữ đã chuẩn hóa nhưng CHƯA qua tidy, để tidy không che mất lỗi. Trả danh sách lỗi (rỗng là đạt).
const MATH = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;

export type ReadResult = { statement: string; steps: string[] };

export function checkImageRead(r: ReadResult): string[] {
  const out: string[] = [];
  if (!r.statement.trim()) out.push("Đề đang rỗng.");
  if (/(^|\n)\s*(lời giải|đáp số|đáp án|hướng dẫn)\b/i.test(r.statement)) out.push('Đề còn lẫn chữ "lời giải" hoặc "đáp số".');
  const items: [string, string][] = [["đề", r.statement], ...r.steps.map((s, i): [string, string] => [`bước ${i + 1}`, s])];
  const seen = new Set<string>();
  const add = (m: string) => { if (!seen.has(m)) { seen.add(m); out.push(m); } };
  for (const [where, t] of items) {
    if (t.includes("¦")) add(`Còn ký tự lạ ¦ trong ${where}.`);
    if (((t.replace(/\$\$/g, "").match(/\$/g) ?? []).length) % 2) add(`Số dấu $ bị lẻ trong ${where}.`);
    for (const m of t.matchAll(MATH)) {
      const src = (m[1] ?? m[2]).trim();
      try { katex.renderToString(src, { throwOnError: true, trust: false }); } catch { add(`Công thức không dựng được trong ${where}: ${src.slice(0, 40)}`); continue; }
      for (const c of src.matchAll(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g)) {
        if (!c[1].includes("\\\\") && (c[1].match(/=/g) ?? []).length >= 2) add(`Hệ phương trình trong ${where} thiếu dấu ngăn giữa các hàng.`);
      }
    }
    const b = (t.match(/\\begin\{/g) ?? []).length, e = (t.match(/\\end\{/g) ?? []).length;
    if (b !== e) add(`\\begin và \\end không khớp trong ${where}.`);
  }
  return out;
}
