import { askText, type LlmCfg, type Turn } from "@/lib/llm";
import { checkImageRead } from "@/lib/image-check";
import { tidyLine, tidyStatement } from "@/lib/repair";
import { stripStep } from "@/lib/chat/progress";
import { FORMAT_RULE } from "@/lib/format-rule";
import { normalizeText, parseAnswers } from "@/lib/read-image";
import { tagged } from "@/lib/tagged";

// Đọc một ảnh hoặc một đoạn chữ có NHIỀU đề (tệp Word nạp hàng loạt). Mỗi đề là một bài toán độc lập; số thứ tự kiểu "Bài 4", "Bài A.03" không cần giữ.
export type ReadItem = { statement: string; solution: Record<string, unknown>; solution_steps: string[]; warnings: string[] };
export type ReadInput = { image?: { mime: string; b64: string }; text?: string };

const BS = String.fromCharCode(92);

export const MULTI_PROMPT = (src: "ảnh" | "văn bản") => `Đây là ${src} chứa MỘT HOẶC NHIỀU đề Toán. Mỗi đề là một bài toán độc lập. Đọc, tách từng đề và PHÂN LOẠI nội dung, chép NGUYÊN VĂN, không tự giải${src === "ảnh" ? ", bỏ qua hình vẽ" : ""}.
Chỉ trả văn bản đúng theo khung thẻ sau, mỗi đề một thẻ <bai>, theo thứ tự xuất hiện, không viết gì ngoài các thẻ, không dùng JSON, không dùng khối mã:
<bai>
<de>
chỉ đề bài
</de>
<dapan>
mỗi đáp án một dòng dạng: tên = giá trị
</dapan>
<cachgiai>
mỗi bước một dòng
</cachgiai>
</bai>
Quy tắc:
- <de>: CHỈ đề bài (giả thiết, câu hỏi). BỎ số thứ tự và nhãn đầu đề như "Bài 4:", "Bài A.03:", "Câu 2." Không chứa đáp án, lời giải, "Giải", "ĐS", "Đ/S", "Đáp số", "Hướng dẫn".
- <dapan>: chỉ khi ${src} CÓ GHI đáp số hoặc kết luận cuối lời giải của chính đề đó (chép lại, KHÔNG tự tính). Mỗi dòng một đáp án: x = 3 viết "x = 3"; nhiều số cần tìm thì đặt tên x1, x2 (ví dụ "Số cần tìm là 15 và 36" viết "x1 = 15" và "x2 = 36"); đáp án chữ hoặc vô nghiệm viết "ket_luan = vô nghiệm" ngắn gọn. Đề không có đáp số thì để thẻ rỗng, đừng bịa.
- <cachgiai>: các bước cách giải nếu ${src} có ghi, mỗi bước một dòng, bỏ chữ "Bước N:". Không có thì để thẻ rỗng.
- Đáp số, lời giải thuộc về đề nằm ngay trước nó. Đề nhiều ý thì xuống dòng giữa các ý, mỗi ý bắt đầu bằng a), b), c), dòng đầu là phần dẫn chung. Chép đúng số liệu và dấu chấm phẩy; chỉ sửa lỗi gõ sai chữ rõ ràng (ví dụ "chayyj" thành "chạy"), TUYỆT ĐỐI không đổi số liệu.
- Đơn vị và chữ tiếng Việt viết NGOÀI công thức, ví dụ "$40$ phút", "$4$ km", "$600$ sản phẩm"; không dùng ${BS}text trong công thức.
- Trong công thức, hệ phương trình dùng cases, mỗi phương trình một hàng, các hàng ngăn nhau bằng ${BS}${BS} của LaTeX, cả hệ nằm trên MỘT dòng.${FORMAT_RULE}`;

// Nhãn đầu đề model lỡ chép: "Bài 4:", "Bài A.03.", "Câu 2)".
const LABEL = /^\s*(?:bài|câu|đề)\s*(?:số\s*)?(?:[A-Za-z]\s*[.\-]\s*)?\d+\s*[.:)\-–]\s*/i;

export const stripLabel = (s: string) => s.replace(LABEL, "").trim();

const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

// Tách các thẻ <bai> trong văn bản model trả. Chịu được thiếu thẻ đóng, lời dẫn ngoài thẻ, rào markdown. Không có đề nào thì mảng rỗng.
export function parseMulti(text: string): Omit<ReadItem, "warnings">[] {
  const t = text.replace(/```[a-z]*\n?|```/gi, "");
  const out: Omit<ReadItem, "warnings">[] = [];
  for (const m of t.matchAll(/<bai>([\s\S]*?)(?:<\/bai>|(?=<bai>)|$)/gi)) {
    const g = tagged(m[1], ["de", "dapan", "cachgiai"]);
    if (g.de === null) continue;
    const statement = tidyStatement(normalizeText(stripLabel(g.de)));
    if (statement.length < 15) continue;
    out.push({
      statement,
      solution: parseAnswers(normalizeText(g.dapan ?? "")),
      solution_steps: lines(g.cachgiai ?? "").map((l) => tidyLine(normalizeText(stripStep(l)))).filter((s) => s.trim()),
    });
  }
  return out;
}

type Ask = typeof askText;
const TOTAL_MS = 50_000; // route có maxDuration 60 giây
const RETRY_MIN_MS = 15_000;
const MAX_TRIES = 2;

const check = (it: Omit<ReadItem, "warnings">) => checkImageRead({ statement: it.statement, steps: it.solution_steps });

// Đọc nguồn nhiều đề: hỏi model, tự kiểm hình thức từng đề, có lỗi thì cho đọc lại một lần; giữ lần ít lỗi nhất.
// Không ra đề nào thì ném lỗi để client ghi vào lịch sử. ask truyền vào để test.
export async function readExamItems(cfg: LlmCfg, input: ReadInput, ask: Ask = askText): Promise<{ items: ReadItem[]; attempts: number }> {
  const start = Date.now();
  const src = input.image ? "ảnh" : "văn bản";
  const first: Turn[] = [input.image ? { role: "user", text: "Đọc các đề trong ảnh.", image: input.image } : { role: "user", text: `Đọc các đề trong văn bản sau:\n${input.text ?? ""}` }];
  let turns = first;
  let best: { items: ReadItem[]; bad: number } | null = null;
  let attempts = 0;
  for (let k = 0; k < MAX_TRIES; k++) {
    const left = TOTAL_MS - (Date.now() - start);
    if (k > 0 && left < RETRY_MIN_MS) break;
    attempts++;
    let raw: string;
    try { raw = await ask(cfg, MULTI_PROMPT(src), turns, { deadlineMs: left, attemptMs: 25_000, use: "read_image" }); } catch (e) { if (best) break; throw e; }
    const items = parseMulti(raw).map((it) => ({ ...it, warnings: check(it) }));
    const bad = items.reduce((n, it) => n + it.warnings.length, 0);
    if (items.length && (!best || bad < best.bad)) best = { items, bad };
    if (items.length && !bad) break;
    const why = items.length ? items.flatMap((it, i) => it.warnings.map((w) => `đề ${i + 1}: ${w}`)).slice(0, 6).join("; ") : "không tách được đề nào theo khung thẻ <bai>";
    turns = [...first, { role: "model", text: raw }, { role: "user", text: `Lần đọc trước có lỗi: ${why}. Đọc lại và trả lại ĐỦ mọi đề theo khung thẻ, sửa các lỗi đó.` }];
  }
  if (!best) throw new Error(`Không tách được đề nào từ ${src}.`);
  return { items: best.items, attempts };
}
