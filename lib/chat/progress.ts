import type { Problem } from "@/lib/schema/problem";

// Chuẩn hóa số: bỏ dấu phân cách nghìn, dấu phẩy thập phân -> chấm. "300.000" -> 300000, "0,85" -> 0.85
// Học sinh hay gõ "90k", "90 nghìn": đổi thành 90000.
export const norm = (t: string) =>
  t.replace(/(?<=\d)[.,\s](?=\d{3}\b)/g, "").replace(/(?<=\d),(?=\d)/g, ".")
    .replace(/(\d+(?:\.\d+)?)\s*(?:k|nghìn|ngàn)\b/gi, (_, n: string) => String(Math.round(Number(n) * 1000)));
export const numsIn = (t: string) => norm(t).match(/\d+(\.\d+)?/g) ?? [];
export const hasNum = (text: string, n: string) => new RegExp(`(?<!\\d)${n}(?!\\d)`).test(norm(text));

export type Cp = { id: number; label: string; anchors: string[]; must: string[] };

// Mốc = từng bước của solution_steps. must = số đáp án (có trong solution, đề chưa nêu) mà bước đó ra; anchors = mọi số của bước.
// ponytail: suy ra tự động từ solution_steps, không cần soạn thêm. Đề không có solution_steps thì dùng 1 mốc từ số đáp án.
export function checkpoints(p: Problem): Cp[] {
  const given = new Set(numsIn(JSON.stringify([p.data, p.statement ?? ""])));
  const sol = new Set(numsIn(JSON.stringify(p.solution)).filter((n) => !given.has(n)));
  if (!p.solution_steps.length) return [{ id: 0, label: "Nêu đáp án", anchors: [...sol], must: [...sol] }];
  return p.solution_steps.map((label, id) => {
    const anchors = [...new Set(numsIn(label))];
    return { id, label, anchors, must: anchors.filter((n) => sol.has(n)) };
  });
}

// Máy kiểm số học sinh vừa nêu: khớp số của lời giải / không khớp mốc nào. Chỉ nêu số chính học sinh viết nên không lộ đáp án.
// ponytail: chỉ so số, không hiểu biểu thức. Cách giải khác đáng ra đúng sẽ bị báo "không khớp" (prompt dặn hỏi cách tính, không kết luận sai). Nâng cấp: parser biểu thức.
export function verdict(text: string, p: Problem, cps: Cp[]) {
  const given = new Set(numsIn(JSON.stringify([p.data, p.statement ?? ""])));
  const sol = new Set([...numsIn(JSON.stringify(p.solution)), ...cps.flatMap((c) => c.anchors)]);
  const mine = [...new Set(numsIn(text))].filter((n) => !given.has(n) && (n.length >= 3 || n.includes(".") || sol.has(n)));
  return { match: mine.filter((n) => sol.has(n)), miss: mine.filter((n) => !sol.has(n)) };
}

const words = (t: string) => t.toLowerCase().match(/[\p{L}\d]+/gu) ?? [];
// Reply quá 45 từ: giữ câu đầu + câu hỏi cuối. Không tách ở dấu chấm thập phân (cần khoảng trắng sau dấu câu).
export function tighten(r: string) {
  if (words(r).length <= 45) return r;
  const ss = r.split(/(?<=[.!?])\s+/);
  const q = ss.length > 1 && ss.at(-1)!.endsWith("?") ? ss.at(-1)! : "";
  return q ? `${ss[0]} ${q}` : r;
}
// Độ giống 0..1 giữa hai câu (Jaccard theo tập từ): bot lặp lại câu trước thì > 0.8.
export function sim(a: string, b: string) {
  const x = new Set(words(a)), y = new Set(words(b));
  const n = [...x].filter((w) => y.has(w)).length;
  return x.size + y.size ? n / (x.size + y.size - n) : 0;
}

// Thang lạc đề: lần 1 nhắc nhẹ, lần 2 nhắc kèm mời làm tiếp, lần 3 chốt phiên. Đếm từ lịch sử (không cần cột DB mới).
export const OFF_REPLIES = [
  "Mình chỉ hỗ trợ bài toán này thôi nhé. Bạn quay lại bài và thử bước tiếp theo cùng mình nha?",
  "Mình vẫn ở đây chờ bạn làm bài. Bạn thử viết bước tiếp theo, sai cũng không sao nhé?",
  "Mình thấy bạn chưa muốn làm bài lúc này, nên mình dừng ở đây nhé. Khi nào sẵn sàng, bạn quay lại làm tiếp!",
];
export const SOS_REPLY = "Mình nghe bạn rồi. Chuyện này quan trọng hơn bài toán, bạn hãy nói với thầy cô hoặc người lớn bạn tin tưởng nhé. Khi nào sẵn sàng, mình cùng làm tiếp bài.";
export function offStreak(history: { role: string; content: string }[]) {
  let n = 0;
  for (const m of [...history].reverse()) {
    if (m.role !== "bot") continue;
    if (!OFF_REPLIES.includes(m.content)) break;
    n++;
  }
  return n;
}

// Bit 30 của mask = học sinh đã trình bày cách làm đúng (AI xác nhận, server kiểm bằng chứng). Không tính vào số mốc.
export const METHOD = 1 << 30;
export const countDone = (mask: number) => (mask & (METHOD - 1)).toString(2).replace(/0/g, "").length;

// Server xác minh bằng chứng AI nộp: trích nguyên văn từ tin của học sinh, và số của mốc phải do học sinh tự viết.
export function verify(c: Cp, evidence: string, said: string) {
  const ev = norm(evidence).replace(/\s+/g, " ").trim().toLowerCase();
  if (ev.length < 3 || !norm(said).replace(/\s+/g, " ").toLowerCase().includes(ev)) return false;
  if (c.must.some((n) => !hasNum(said, n))) return false;
  return !c.anchors.length || c.anchors.some((n) => hasNum(evidence, n)) || c.must.length > 0;
}

// Thanh 5 bước Polya hiển thị: tính từ tiến độ thật, không do AI quyết định.
export const stepOf = (done: number, total: number) => (done >= total ? 5 : Math.min(4, 1 + Math.floor((done / total) * 4)));
