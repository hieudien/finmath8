import { problemText } from "@/lib/figure";
import { askJson, askText, type LlmCfg } from "@/lib/llm";
import { PROVIDERS } from "@/lib/models";
import { z } from "zod";
import { swallow } from "@/lib/errors";
import { gradeRule } from "@/lib/grade";
import { FORMAT_RULE } from "@/lib/format-rule";
import { parseAnswers } from "@/lib/read-image";
import { tagged } from "@/lib/tagged";
import { canon, nums, texts } from "@/lib/answer-check";
import { dropRedundantSummary } from "@/lib/answers";

// Bước GIẢI riêng: một lần gọi chỉ để giải, trả lời giải và đáp án cùng lúc (khỏi lệch nhau), làm trước đáp án sau, tự thay số kiểm.
// Cùng model với các bước khác; khác ở chỗ chỉ làm một việc, nhiệt độ thấp, văn bản có thẻ (không JSON, khỏi hỏng dấu \).
const SOLVE_PROMPT = `Bạn là giáo viên Toán. CHỈ giải bài, trả lời giải và đáp án; không viết gợi ý.
Cách làm:
1. Xác định ẩn, tham số, điều kiện, từng ý a), b)...
2. Giải lần lượt từng ý, mỗi bước một phép biến đổi, viết đủ phép tính trung gian, cẩn thận dấu và hệ số. Ý sau dùng kết quả ý trước.
3. Đề có tham số: thay một giá trị cụ thể của tham số để kiểm tra công thức tổng quát; không khớp thì tính lại.
4. Thay đáp án cuối vào đề để kiểm tra; sai thì sửa.
5. Đề chứng minh nhiều ý: các ý "chứng minh" không có đáp án để ghi; đáp án chỉ là kết quả của ý "tìm/xác định/tính" (ví dụ "H là tâm đường tròn nội tiếp tam giác DEF"), viết cụ thể, không viết kiểu "đã chứng minh xong". Tên đáp án của đề chứng minh luôn là ket_luan (không thêm tiền tố ý, không bắt đầu bằng số).
Chỉ trả văn bản đúng khung, không JSON, không khối mã:
<loi_giai>
mỗi bước một dòng, công thức $...$ LaTeX, bước cuối là kết luận
</loi_giai>
<kiem_tra>
1–2 dòng: đã thay số nào, có khớp không
</kiem_tra>
<dap_an>
mỗi dòng: tên = giá trị. Số viết thuần (thập phân dùng dấu chấm, phân số a/b); nhiều nghiệm đặt x1, x2.
Đề nhiều ý a), b): tên có tiền tố ý (a_x = 2, b_m = -6). Một ý: đặt theo ẩn hoặc tham số (x = 3, m = -6).
ket_luan chỉ cho đáp án chữ (vô nghiệm, "m khác 2", tên người...), không dùng khi đáp án đã là số.
</dap_an>`;

export type Solved = { steps: string[]; answers: Record<string, unknown>; check: string };
type P = { statement: string; grade: number; figure?: { desc?: string } | null }; // có figure thì mô tả hình được đưa vào đề
type Opts = { temperature?: number; seed?: number; hint?: string; deadlineMs?: number };

// "14/3" thành số; các giá trị khác giữ nguyên.
export function fracToNumber(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => {
    const m = typeof v === "string" ? v.replace(/\s/g, "").match(/^(-?\d+)\/(\d+)$/) : null;
    return [k, m && Number(m[2]) ? +(Number(m[1]) / Number(m[2])).toFixed(6) : v];
  }));
}

// Đáp án dạng chữ "m = -6" (hay gặp ở ket_luan) thành {m: -6} để so sánh và chấm bằng số được; chữ khác giữ nguyên.
export function tidyAnswers(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fracToNumber(o))) {
    const m = typeof v === "string" ? v.replace(/[$\s]/g, "").match(/^([A-Za-z]\w*)=(-?\d+(?:\.\d+)?(?:\/\d+)?)$/) : null;
    if (m) Object.assign(out, fracToNumber({ [m[1]]: m[2] }), /^-?\d+(\.\d+)?$/.test(m[2]) ? { [m[1]]: Number(m[2]) } : {});
    else out[k] = v;
  }
  return dropRedundantSummary(out); // ket_luan chỉ nhắc lại các số đã có thì bỏ
}

export function parseSolved(raw: string): Solved | null {
  const t = tagged(raw, ["loi_giai", "kiem_tra", "dap_an"]);
  const answers = tidyAnswers(parseAnswers(t.dap_an ?? ""));
  if (!Object.keys(answers).length) return null;
  return { steps: (t.loi_giai ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean), answers, check: t.kiem_tra ?? "" };
}


// Một lần giải. null khi model không trả đủ khung hoặc không có đáp án.
export async function solveOnce(cfg: LlmCfg, p: P, o: Opts = {}): Promise<Solved | null> {
  const user = `${problemText(p)}${o.hint ? `\n(Gợi ý cách làm: ${o.hint})` : ""}`;
  const raw = await askText(cfg, SOLVE_PROMPT + FORMAT_RULE + gradeRule(p.grade), [{ role: "user", text: user }],
    { think: true, temperature: o.temperature ?? 0, seed: o.seed, use: "answer", deadlineMs: o.deadlineMs });
  return parseSolved(raw);
}

// Hai bộ đáp án cùng kết luận: cùng các số (không kể thứ tự, sai số 0,5%), hoặc cùng chữ chính tắc khi không có số.
export function sameAnswers(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const x = nums(a).sort((m, n) => m - n), y = nums(b).sort((m, n) => m - n);
  if (x.length || y.length) return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) <= Math.abs(y[i]) * 0.005 + 1e-9);
  const s = texts(a).map(canon).sort(), t = texts(b).map(canon).sort();
  return s.length > 0 && s.length === t.length && s.every((v, i) => v === t[i]);
}

// Đề chứng minh: đáp án chỉ có nghĩa với ý "tìm/xác định". Một đáp án chữ thì đặt tên ket_luan; câu kiểu "đã chứng minh xong" không phải đáp án nên bỏ.
export function proofAnswer(statement: string, answers: Record<string, unknown>): Record<string, unknown> {
  if (!/chứng minh/i.test(statement) || nums(answers).length) return answers;
  const keys = Object.keys(answers);
  if (keys.length === 1 && !/chứng minh (xong|được|đầy đủ)|đã chứng minh/i.test(String(answers[keys[0]]))) return { ket_luan: answers[keys[0]] };
  return keys.length === 1 ? {} : answers;
}

// Đề chứng minh nhiều ý: đáp án chỉ là kết quả của ý "tìm/xác định/tính". Model nhỏ hay chọn nhầm ý, nên một lượt riêng bằng model mạnh hơn (models[2]) chỉ trích đáp án ý đó.
// Trả chuỗi đáp án, "" khi đề không có ý như vậy, null khi lỗi (giữ cách cũ).
export async function proofKey(cfg: LlmCfg, p: { statement: string; figure?: { desc?: string } | null }, o: { deadlineMs?: number } = {}): Promise<string | null> {
  if (!/chứng minh/i.test(p.statement)) return null;
  const strong = { ...cfg, model: PROVIDERS[cfg.provider].models[2] ?? cfg.model };
  const r = await askJson(strong, `Đề Toán có nhiều ý, trong đó có ý "chứng minh". Tìm ý yêu cầu TÌM, XÁC ĐỊNH hoặc TÍNH một kết quả (không phải chứng minh), rồi trả đáp án NGẮN GỌN của riêng ý đó, viết cụ thể (ví dụ "H là tâm đường tròn nội tiếp tam giác DEF"). Tự giải cẩn thận dựa vào đề và hình. Đề không có ý nào như vậy thì trả chuỗi rỗng. Chỉ trả JSON {"answer":string}.${FORMAT_RULE}`,
    [{ role: "user", text: problemText(p) }], z.object({ answer: z.string().default("") }), { think: true, use: "answer", deadlineMs: o.deadlineMs, attemptMs: 12_000, models: [strong.model, PROVIDERS[cfg.provider].models[0]] })
    .catch(swallow("trích đáp án đề chứng minh", {}));
  return r ? r.answer.trim() : null;
}
