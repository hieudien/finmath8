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

export const countDone = (mask: number) => mask.toString(2).replace(/0/g, "").length;

// Server xác minh bằng chứng AI nộp: trích nguyên văn từ tin của học sinh, và số của mốc phải do học sinh tự viết.
export function verify(c: Cp, evidence: string, said: string) {
  const ev = norm(evidence).replace(/\s+/g, " ").trim().toLowerCase();
  if (ev.length < 3 || !norm(said).replace(/\s+/g, " ").toLowerCase().includes(ev)) return false;
  if (c.must.some((n) => !hasNum(said, n))) return false;
  return !c.anchors.length || c.anchors.some((n) => hasNum(evidence, n)) || c.must.length > 0;
}

// Thanh 5 bước Polya hiển thị: tính từ tiến độ thật, không do AI quyết định.
export const stepOf = (done: number, total: number) => (done >= total ? 5 : Math.min(4, 1 + Math.floor((done / total) * 4)));
