import { askText, type LlmCfg } from "@/lib/llm";
import { swallow } from "@/lib/errors";
import { gradeRule } from "@/lib/grade";
import { FORMAT_RULE } from "@/lib/format-rule";
import { parseAnswers } from "@/lib/read-image";
import { tagged } from "@/lib/tagged";
import { canon, nums, texts } from "@/lib/answer-check";
import { dropRedundantSummary } from "@/lib/answers";

// Bước GIẢI riêng: một lần gọi chỉ để giải, trả lời giải và đáp án cùng lúc (khỏi lệch nhau), làm trước đáp án sau, tự thay số kiểm.
// Cùng model với các bước khác; khác ở chỗ chỉ làm một việc, nhiệt độ thấp, văn bản có thẻ (không JSON, khỏi hỏng dấu \).
export const SOLVE_PROMPT = `Bạn là giáo viên Toán. CHỈ giải bài, trả lời giải và đáp án; không viết gợi ý.
Cách làm:
1. Xác định ẩn, tham số, điều kiện, từng ý a), b)...
2. Giải lần lượt từng ý, mỗi bước một phép biến đổi, viết đủ phép tính trung gian, cẩn thận dấu và hệ số. Ý sau dùng kết quả ý trước.
3. Đề có tham số: thay một giá trị cụ thể của tham số để kiểm tra công thức tổng quát; không khớp thì tính lại.
4. Thay đáp án cuối vào đề để kiểm tra; sai thì sửa.
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
type P = { statement: string; grade: number };
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
  const user = `${p.statement}${o.hint ? `\n(Gợi ý cách làm: ${o.hint})` : ""}`;
  const raw = await askText(cfg, SOLVE_PROMPT + FORMAT_RULE + gradeRule(p.grade), [{ role: "user", text: user }],
    { think: true, temperature: o.temperature ?? 0, seed: o.seed, use: "answer", deadlineMs: o.deadlineMs });
  return parseSolved(raw);
}

const VERIFY_PROMPT = `Bạn kiểm tra một đáp án Toán bằng cách THAY SỐ, không giải lại bài từ đầu.
Nhận: đề bài và đáp án ứng viên. Việc cần làm: thay đáp án vào điều kiện của đề. Đề có tham số thì thay giá trị tham số vào hệ hoặc phương trình, giải ra các ẩn bằng số, rồi kiểm tra từng điều kiện của đề. Tính bằng số cụ thể, từng bước ngắn.
Chỉ trả văn bản đúng khung sau, không dùng JSON:
<tinh>
các phép thay số ngắn gọn
</tinh>
<ket_qua>
dung nếu đáp án thỏa MỌI điều kiện của đề, sai nếu có điều kiện không thỏa
</ket_qua>`;

// Kiểm đáp án bằng thay số trong một lần gọi mới (không thấy lời giải nên không bị neo vào lập luận).
export async function verifyBySubstitution(cfg: LlmCfg, p: P, answers: Record<string, unknown>, o: { deadlineMs?: number } = {}): Promise<{ ok: boolean; note: string }> {
  const raw = await askText(cfg, VERIFY_PROMPT + gradeRule(p.grade), [{ role: "user", text: `${p.statement}\nĐáp án ứng viên: ${JSON.stringify(answers)}` }],
    { think: true, temperature: 0, use: "cross_check", deadlineMs: o.deadlineMs });
  const t = tagged(raw, ["tinh", "ket_qua"]);
  // Bỏ dấu tiếng Việt rồi lấy từ đầu tiên: "Đúng", "đúng.", "dung" đều là đạt; "sai", "không thỏa" là không.
  const first = (t.ket_qua ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").match(/[a-z]+/)?.[0] ?? "";
  return { ok: first === "dung", note: (t.tinh ?? "").slice(0, 300) };
}

// Hai bộ đáp án cùng kết luận: cùng các số (không kể thứ tự, sai số 0,5%), hoặc cùng chữ chính tắc khi không có số.
export function sameAnswers(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const x = nums(a).sort((m, n) => m - n), y = nums(b).sort((m, n) => m - n);
  if (x.length || y.length) return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) <= Math.abs(y[i]) * 0.005 + 1e-9);
  const s = texts(a).map(canon).sort(), t = texts(b).map(canon).sort();
  return s.length > 0 && s.length === t.length && s.every((v, i) => v === t[i]);
}

export type Reliable = { solved: Solved | null; flagged: boolean; calls: number; why: string };
export type Mode = "once" | "verify" | "vote";

// Giải có kiểm. once: một lần. verify: giải, thay số kiểm bằng lần gọi riêng, không đạt thì giải lại một lần khác cách rồi kiểm tiếp.
// vote: hai lần giải độc lập chạy song song; trùng thì nhận, lệch thì giải lần ba và lấy đa số. flagged = chưa tin được, cần giáo viên xem.
export async function solveReliable(cfg: LlmCfg, p: P, mode: Mode, o: { deadlineMs?: number } = {}): Promise<Reliable> {
  const base = { deadlineMs: o.deadlineMs };
  const sw = swallow("giải đề (bỏ phiếu)", { teacherId: cfg.teacherId, actor: "teacher" });
  if (mode === "once") {
    const a = await solveOnce(cfg, p, base);
    return { solved: a, flagged: !a, calls: 1, why: a ? "" : "model không trả đáp án" };
  }
  if (mode === "verify") {
    const a = await solveOnce(cfg, p, base);
    let calls = 1;
    if (!a) return { solved: null, flagged: true, calls, why: "model không trả đáp án" };
    const v = await verifyBySubstitution(cfg, p, a.answers, base); calls++;
    if (v.ok) return { solved: a, flagged: false, calls, why: "" };
    const b = await solveOnce(cfg, p, { ...base, temperature: 0.4, hint: "chọn cách giải khác lần trước nếu có (ví dụ phương pháp thế thay cho cộng đại số, hoặc ngược lại)" }); calls++;
    if (b) { const v2 = await verifyBySubstitution(cfg, p, b.answers, base); calls++; if (v2.ok) return { solved: b, flagged: false, calls, why: "" }; }
    return { solved: a, flagged: true, calls, why: `thay số không đạt: ${v.note}` };
  }
  const [a, b] = await Promise.all([
    solveOnce(cfg, p, base).catch(sw),
    solveOnce(cfg, p, { ...base, temperature: 0.4, hint: "chọn cách giải khác nếu có (phương pháp thế hoặc cộng đại số)" }).catch(sw),
  ]);
  let calls = 2;
  if (a && b && sameAnswers(a.answers, b.answers)) return { solved: a, flagged: false, calls, why: "" };
  const c = await solveOnce(cfg, p, { ...base, temperature: 0.7 }).catch(sw); calls++;
  const pool = [a, b, c].filter((s): s is Solved => !!s);
  const win = pool.find((s, i) => pool.some((t, j) => j !== i && sameAnswers(s.answers, t.answers)));
  return win ? { solved: win, flagged: false, calls, why: "" } : { solved: pool[0] ?? null, flagged: true, calls, why: "ba lần giải không có hai lần trùng nhau" };
}
