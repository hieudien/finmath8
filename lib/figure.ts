// Hình vẽ của đề (hình học). Ảnh đã cắt riêng lưu ở bucket công khai "figures"; trong đề chỉ giữ đường dẫn và mô tả bằng chữ.
// Mô tả là cách đưa dữ kiện trên hình (AB = 5, góc vuông ở A...) cho AI: chat, giải, chấm đều chỉ đọc chữ.
export type Figure = { path: string; desc: string };
export type Box = [number, number, number, number]; // ymin, xmin, ymax, xmax, thang 0..1000 theo cỡ ảnh (quy ước của Gemini)

export const FIGURE_BUCKET = "figures";
export const figureUrl = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${FIGURE_BUCKET}/${path}`;

// Đề bài kèm dòng mô tả hình, để đưa cho AI thay cho statement trần. Đề không có mô tả thì giữ nguyên.
export function problemText(p: { statement?: string; figure?: { desc?: string } | null }): string {
  const s = p.statement ?? "";
  const d = p.figure?.desc?.trim();
  return d ? `${s}\n[Hình vẽ kèm theo đề: ${d}]` : s;
}

// Khung hình AI trả: "ymin,xmin,ymax,xmax". Không hợp lệ (sai số, ngược chiều, quá nhỏ) thì null để giáo viên tự khoanh.
export function parseBox(s: string): Box | null {
  const n = s.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (!n || n.length < 4) return null;
  const [y0, x0, y1, x1] = n.slice(0, 4).map((v) => Math.max(0, Math.min(1000, Math.round(v))));
  if (y1 - y0 < 30 || x1 - x0 < 30) return null;
  return [y0, x0, y1, x1];
}

// Tách thẻ <hinh> và <khung> trong văn bản AI trả về (cạnh <de>, <dapan>, <cachgiai>).
export function parseFigureTags(text: string): { desc: string; box: Box | null } {
  const t = text.replace(/```[a-z]*\n?|```/gi, "");
  const get = (tag: string) => t.match(new RegExp(`<${tag}>([\\s\\S]*?)(?:</${tag}>|(?=<(?:de|dapan|cachgiai|hinh|khung)>)|$)`, "i"))?.[1].trim() ?? "";
  return { desc: get("hinh"), box: parseBox(get("khung")) };
}
