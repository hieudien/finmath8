import JSZip from "jszip";

// Đọc tệp Word (.docx) ngay trên trình duyệt: lấy chữ và ảnh theo đúng thứ tự trong tài liệu.
// Chữ liền nhau gộp thành đoạn (mỗi đoạn tối đa TEXT_MAX ký tự), mỗi ảnh là một nguồn riêng. Việc tách thành từng đề do AI làm ở server.
export type Source = { kind: "image"; name: string; dataUrl: string } | { kind: "text"; name: string; text: string };

export const TEXT_MAX = 6000;
const IMG_MAX = 4_500_000; // ký tự base64: server nhận tối đa 6 triệu ký tự, hosting giới hạn thân request ~4,5MB
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

// Tách nội dung document.xml thành khối theo thứ tự: chữ của từng đoạn văn (w:t, m:t của công thức Word) và ảnh (r:embed).
export function blocks(xml: string): ({ text: string } | { embed: string })[] {
  const out: ({ text: string } | { embed: string })[] = [];
  for (const p of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    let text = "";
    for (const t of p[0].matchAll(/<(?:w|m):t(?:\s[^>]*)?>([^<]*)<\/(?:w|m):t>|<w:tab\/>|<w:br\/>|<a:blip\b[^>]*>/g)) {
      if (t[0].startsWith("<a:blip")) {
        if (text.trim()) { out.push({ text }); text = ""; }
        const id = attr(t[0], "r:embed");
        if (id) out.push({ embed: id });
      } else text += t[1] !== undefined ? unxml(t[1]) : " ";
    }
    if (text.trim()) out.push({ text });
  }
  return out;
}

// Gộp các khối chữ liền nhau, cắt theo ranh giới đoạn văn khi quá dài.
export function chunkText(parts: string[]): string[] {
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    const t = p.replace(/[ \t]+/g, " ").trim();
    if (cur && cur.length + t.length + 1 > TEXT_MAX) { out.push(cur); cur = ""; }
    cur += (cur ? "\n" : "") + t;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export async function readDocx(buf: ArrayBuffer | Uint8Array): Promise<{ sources: Source[]; skipped: string[] }> {
  const zip = await JSZip.loadAsync(buf);
  const doc = await zip.file("word/document.xml")?.async("string");
  if (!doc) throw new Error("Không phải tệp Word (.docx) hợp lệ.");
  const relXml = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const rels = new Map<string, string>();
  for (const r of relXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(r[0], "Id"), target = attr(r[0], "Target");
    if (id && target) rels.set(id, target);
  }
  const sources: Source[] = [], skipped: string[] = [];
  let pending: string[] = [], imgN = 0, txtN = 0;
  const flush = () => { for (const text of chunkText(pending)) sources.push({ kind: "text", name: `Đoạn chữ ${++txtN}`, text }); pending = []; };
  for (const b of blocks(doc)) {
    if ("text" in b) { pending.push(b.text); continue; }
    flush();
    imgN++;
    const target = rels.get(b.embed) ?? "";
    const ext = target.split(".").pop()?.toLowerCase() ?? "";
    const file = zip.file("word/" + target.replace(/^\/?(word\/)?/, ""));
    if (!file || !MIME[ext]) { skipped.push(`Ảnh ${imgN}: định dạng .${ext || "?"} chưa đọc được (chỉ nhận png, jpeg, webp).`); continue; }
    const b64 = await file.async("base64");
    if (b64.length > IMG_MAX) { skipped.push(`Ảnh ${imgN}: quá lớn (${Math.round(b64.length / 1.37 / 1_000_000 * 10) / 10}MB). Thu nhỏ ảnh rồi nạp lại.`); continue; }
    sources.push({ kind: "image", name: `Ảnh ${imgN}`, dataUrl: `data:${MIME[ext]};base64,${b64}` });
  }
  flush();
  return { sources, skipped };
}
