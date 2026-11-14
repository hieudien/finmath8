import { askText, type LlmCfg, type Turn } from "@/lib/llm";
import { checkImageRead } from "@/lib/image-check";
import { tidyLine, tidyStatement } from "@/lib/repair";
import { stripStep } from "@/lib/chat/progress";
import { FORMAT_RULE } from "@/lib/format-rule";
import { parseFigureTags, type Box } from "@/lib/figure";

export type ImageFigure = { desc: string; box: Box | null }; // box null: AI không khoanh được hình, giáo viên tự khoanh
export type ImageResult = { statement: string; solution: Record<string, unknown>; solution_steps: string[]; figure?: ImageFigure };
export type ImageRead = ImageResult & { warnings: string[]; attempts: number };

const BS = String.fromCharCode(92);

// Không dùng JSON: JSON làm hỏng dấu \ của LaTeX (\begin thành ký tự điều khiển, \\ thành \). Model trả văn bản có thẻ, code tự tách.
export const IMAGE_PROMPT = `Đây là ảnh chụp một đề Toán. Đọc và PHÂN LOẠI nội dung trong ảnh, chép NGUYÊN VĂN, không tự giải. Hình vẽ minh họa đề (nếu có) không chép vào <de>, chỉ xử lý ở thẻ <hinh> và <khung>.
Chỉ trả văn bản đúng theo khung thẻ sau, không viết gì ngoài các thẻ, không dùng JSON, không dùng khối mã:
<de>
chỉ đề bài
</de>
<dapan>
mỗi đáp án một dòng dạng: tên = giá trị
</dapan>
<cachgiai>
mỗi bước một dòng
</cachgiai>
<hinh>
mô tả hình vẽ của đề
</hinh>
<khung>
ymin,xmin,ymax,xmax
</khung>
Quy tắc:
- <hinh>: nếu ảnh có hình vẽ của đề (hình học, sơ đồ, đồ thị), mô tả bằng chữ đủ để người không thấy hình vẫn làm được bài: các điểm, đoạn thẳng, đường tròn, quan hệ vuông góc/song song/thuộc, góc, và MỌI số đo hoặc ký hiệu ghi trên hình (độ dài, số đo góc, dấu bằng nhau). Chỉ mô tả cái nhìn thấy trên hình, không suy diễn, không giải. Ảnh không có hình vẽ thì để thẻ rỗng.
- <khung>: vị trí chữ nhật chứa riêng hình vẽ (không lấy chữ đề), bốn số nguyên từ 0 đến 1000 theo cỡ ảnh, thứ tự ymin,xmin,ymax,xmax (0,0 là góc trên trái). Không có hình thì để thẻ rỗng. Ảnh có nhiều hình thì chỉ lấy hình của đề đầu.
- <de>: CHỈ đề bài (giả thiết, câu hỏi). KHÔNG chứa đáp án, lời giải, "Giải", "ĐS", "Đáp số", "Hướng dẫn".
- <dapan>: đáp án cuối nếu ảnh có ghi đáp số hoặc có kết luận cuối lời giải (chép lại, KHÔNG tự tính). Mỗi dòng một đáp án: x = 3 viết "x = 3"; nhiều nghiệm đặt tên x1, x2; đáp án chữ hoặc vô nghiệm viết "ket_luan = vô nghiệm" ngắn gọn. Ảnh không có đáp án thì để thẻ rỗng.
- <cachgiai>: các bước cách giải nếu ảnh có ghi, mỗi bước một dòng, bỏ chữ "Bước N:". Ảnh không có cách giải thì để thẻ rỗng.
Ảnh nhiều đề thì chỉ lấy đề đầu. Đề nhiều ý thì xuống dòng giữa các ý, mỗi ý bắt đầu bằng a), b), c) (hoặc 1), 2)), dòng đầu là phần dẫn chung. Hệ phương trình nằm cùng dòng với câu dẫn nếu trong ảnh như vậy; số hiệu như (I) viết ngay sau hệ. Chép đúng dấu chấm phẩy của đề.
Trong công thức, hệ phương trình dùng cases, mỗi phương trình một hàng, các hàng ngăn nhau bằng ${BS}${BS} của LaTeX, cả hệ nằm trên MỘT dòng.${FORMAT_RULE}`;

// Mô tả riêng một hình vẽ (giáo viên tự thêm hình): cùng quy tắc với thẻ <hinh> của IMAGE_PROMPT.
export const DESCRIBE_FIGURE = `Đây là hình vẽ của một đề Toán. Mô tả bằng chữ tiếng Việt đủ để người không thấy hình vẫn làm được bài: các điểm, đoạn thẳng, đường tròn, quan hệ vuông góc/song song/thuộc, góc, và MỌI số đo hoặc ký hiệu ghi trên hình (độ dài, số đo góc, dấu bằng nhau). Chỉ mô tả cái nhìn thấy trên hình, không suy diễn, không giải, không dùng khối mã. Công thức đặt trong $...$ theo LaTeX. Viết 1 đến 4 câu.${FORMAT_RULE}`;

const MATH = /\$\$[\s\S]+?\$\$|\$[^$]+?\$/g;

// Tách văn bản có thẻ. Chịu được thiếu thẻ đóng, lời dẫn ngoài thẻ, rào markdown. Không có <de> thì null.
export function parseTagged(text: string): { de: string; dapan: string; cachgiai: string } | null {
  const t = text.replace(/```[a-z]*\n?|```/gi, "");
  const get = (tag: string) => {
    const m = t.match(new RegExp(`<${tag}>([\\s\\S]*?)(?:</${tag}>|(?=<(?:de|dapan|cachgiai|hinh|khung)>)|$)`, "i"));
    return m ? m[1].trim() : null;
  };
  const de = get("de");
  if (de === null) return null;
  return { de, dapan: get("dapan") ?? "", cachgiai: get("cachgiai") ?? "" };
}

// Ngoài công thức: "\n" dạng chữ (model viết hai ký tự) đổi thành xuống dòng thật, ¦ còn sót thì bỏ. Trong công thức: ¦ đổi lại thành \.
export function normalizeText(s: string): string {
  const lit = new RegExp(`${BS}${BS}n(?=\\s|${BS}${BS}|$|(?:[a-e]|\\d{1,2})\\))`, "g");
  let out = "";
  let last = 0;
  const outside = (t: string) => t.replace(lit, "\n").replace(/¦n(?![a-z])/g, "\n").replaceAll("¦", "");
  for (const m of s.matchAll(MATH)) {
    out += outside(s.slice(last, m.index)) + m[0].replaceAll("¦", BS);
    last = m.index + m[0].length;
  }
  return out + outside(s.slice(last));
}

const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

export function parseAnswers(s: string): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const l of lines(s)) {
    const m = l.match(/^([A-Za-z_][\w]*)\s*[=:]\s*(.+)$/);
    if (!m) continue;
    const v = m[2].trim();
    o[m[1]] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v.replace(/^\$|\$$/g, "");
  }
  return o;
}

type Ask = typeof askText;
const TOTAL_MS = 50_000; // route có maxDuration 60 giây
const RETRY_MIN_MS = 15_000; // còn ít hơn thế thì không thử lại
const MAX_TRIES = 3;

// Đọc đề từ ảnh: hỏi model, tự kiểm, lỗi hình thức thì cho model đọc lại (tối đa MAX_TRIES lần), giữ kết quả ít lỗi nhất.
// Không tách được thẻ ở lần đầu thì rơi về cách cũ (legacy, trả JSON) một lần. ask truyền vào để test.
export async function readExamImage(
  cfg: LlmCfg,
  image: { mime: string; b64: string },
  legacy: (deadlineMs: number) => Promise<ImageResult>,
  ask: Ask = askText,
): Promise<ImageRead> {
  const start = Date.now();
  const first: Turn[] = [{ role: "user", text: "Đọc đề trong ảnh.", image }];
  let turns = first;
  let best: (ImageResult & { problems: string[] }) | null = null;
  let attempts = 0;
  for (let k = 0; k < MAX_TRIES; k++) {
    const left = TOTAL_MS - (Date.now() - start);
    if (k > 0 && left < RETRY_MIN_MS) break;
    attempts++;
    let raw: string;
    try { raw = await ask(cfg, IMAGE_PROMPT, turns, { deadlineMs: left, attemptMs: 20_000, use: "read_image" }); } catch (e) { if (best) break; throw e; }
    const parsed = parseTagged(raw);
    if (!parsed) {
      if (best) break;
      const rest = TOTAL_MS - (Date.now() - start);
      const r = await legacy(Math.max(rest, 5_000));
      return { ...r, warnings: checkImageRead({ statement: r.statement, steps: r.solution_steps }), attempts: attempts + 1 };
    }
    const statement = normalizeText(parsed.de);
    const steps = lines(parsed.cachgiai).map((l) => normalizeText(stripStep(l))).filter(Boolean);
    const problems = checkImageRead({ statement, steps });
    const fg = parseFigureTags(raw);
    const figure = fg.desc || fg.box ? { desc: normalizeText(fg.desc), box: fg.box } : undefined;
    const cur = { figure, statement: tidyStatement(statement), solution: parseAnswers(normalizeText(parsed.dapan)), solution_steps: steps.map(tidyLine).filter((s) => s.trim()), problems };
    if (!best || problems.length < best.problems.length) best = cur;
    if (!problems.length) break;
    turns = [...first, { role: "model", text: raw }, { role: "user", text: `Lần đọc trước có lỗi: ${problems.join("; ")}. Đọc lại ảnh và trả lại đầy đủ các thẻ, sửa các lỗi đó.` }];
  }
  const { problems, ...r } = best!;
  return { ...r, warnings: problems, attempts };
}
