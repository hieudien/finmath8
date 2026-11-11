// Tách văn bản model trả theo thẻ <ten>...</ten>. Chịu được thiếu thẻ đóng (lấy đến thẻ kế tiếp hoặc hết chuỗi), lời dẫn ngoài thẻ và rào markdown.
// Thẻ không có thì null.
export function tagged(text: string, names: string[]): Record<string, string | null> {
  const t = text.replace(/```[a-z]*\n?|```/gi, "");
  const alt = names.join("|");
  const out: Record<string, string | null> = {};
  for (const n of names) {
    const m = t.match(new RegExp(`<${n}>([\\s\\S]*?)(?:</${n}>|(?=<(?:${alt})>)|$)`, "i"));
    out[n] = m ? m[1].trim() : null;
  }
  return out;
}
