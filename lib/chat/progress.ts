import type { Problem } from "@/lib/schema/problem";
import { plain } from "@/lib/plain";
import { canon } from "@/lib/answer-check";

// Chuẩn hóa số: bỏ dấu phân cách nghìn, dấu phẩy thập phân -> chấm. "300.000" -> 300000, "0,85" -> 0.85
// Học sinh hay gõ "90k", "90 nghìn": đổi thành 90000.
// Công thức LaTeX (\frac{1}{2}, x^{2}) đổi sang chữ thường trước; phân số số nguyên đổi thành số thập phân (\frac{1}{2} -> 0.5) để so được với đáp án.
const latex = (t: string) => plain(t.replace(/\\frac(?:\{(-?\d+)\}|(\d))(?:\{(\d+)\}|(\d))/g, (m, a1?: string, a2?: string, b1?: string, b2?: string) => { const a = a1 ?? a2!, b = b1 ?? b2!; return +b ? String(+(Number(a) / Number(b)).toFixed(4)) : m; }));
export const norm = (t: string) =>
  latex(t).replace(/(?<=\d)[.,\s](?=\d{3}\b)/g, "").replace(/(?<=\d),(?=\d)/g, ".")
    // Phân số số nguyên viết thẳng "3/2" thành số thập phân như \frac{3}{2} (học sinh gõ 3/2 thay vì 1,5). Không đổi "Bước 1/5" (số bước, không phải phân số).
    .replace(/(?<!Bước\s)(?<![\d/.])(\d+)\s*\/\s*(\d+)(?![\d/])/g, (m, a: string, b: string) => (+b ? String(+(Number(a) / Number(b)).toFixed(4)) : m))
    .replace(/(\d+(?:\.\d+)?)\s*(?:k|nghìn|ngàn)\b/gi, (_, n: string) => String(Math.round(Number(n) * 1000)));
export const numsIn = (t: string) => norm(t).match(/\d+(\.\d+)?/g) ?? [];
// n có thể là số thập phân ("1.5"): phải thoát dấu chấm, nếu không "1.5" khớp nhầm "1/5", "1 5" (vd "Bước 1/5").
export const hasNum = (text: string, n: string) => new RegExp(`(?<!\\d)${n.replace(/\./g, "\\.")}(?!\\d)`).test(norm(text));

// must = số kết quả chuẩn của mốc; alt = các bộ số khác cũng được (accepts); words = dạng chữ/biểu thức chuẩn hóa (từ step_checks).
export type Cp = { id: number; label: string; anchors: string[]; must: string[]; alt?: string[][]; words?: string[] };

export const stripStep = (s: string) => s.replace(/^Bước \d+\s*[:.)-]\s*/i, "");
// Mốc = từng bước của solution_steps. must = số đáp án (có trong solution, đề chưa nêu) mà bước đó ra; anchors = mọi số của bước.
// ponytail: suy ra tự động từ solution_steps, không cần soạn thêm. Đề không có solution_steps thì dùng 1 mốc từ số đáp án.
export function checkpoints(p: Problem): Cp[] {
  const given = new Set(numsIn(JSON.stringify([p.data, p.statement ?? ""])));
  const sol = new Set(numsIn(JSON.stringify(p.solution)).filter((n) => !given.has(n)));
  if (!p.solution_steps.length) return [{ id: 0, label: "Nêu đáp án", anchors: [...sol], must: [...sol] }];
  const chk = p.step_checks.length === p.solution_steps.length ? p.step_checks : []; // lệch số bước (giáo viên sửa lời giải) thì không dùng
  // Kết quả chuẩn dạng số thuần (45000, 15%, 0,5): so bằng số. Còn lại (x=2, vô nghiệm, biểu thức): so chuỗi chính tắc.
  const isNum = (x: string) => /^[-+]?[\d.,\s]+\s*(%|đồng|nghìn|ngàn|k|tuần|tháng|năm|ngày|bạn|gb|cm|kg|m)?$/iu.test(x.trim().replace(/^\$|\$$/g, ""));
  const seen = new Set<string>();
  return p.solution_steps.map((label, id) => {
    const anchors = [...new Set(numsIn(stripStep(label)))]; // bỏ "Bước N:" khỏi nhãn: số thứ tự bước không phải số của lời giải
    const cand = chk[id]?.result ? [chk[id].result, ...chk[id].accepts] : [];
    const sets = cand.filter(isNum).map((x) => [...new Set(numsIn(x))].filter((n) => !given.has(n))).filter((s) => s.length);
    const words = cand.filter((x) => !isNum(x)).map(canon).filter((w) => w.length >= 2);
    // Đề cũ chưa có step_checks: lấy kết quả cuối "ẩn = số" của lời giải bước (vd "...từ đó tính được y = 2") làm dạng chữ chuẩn, để học sinh viết gọn vẫn khớp.
    if (!cand.length && !words.length) { const fin = [...stripStep(label).matchAll(/\b([a-z])\s*=\s*(-?\d+(?:[.,]\d+)?)(?![\d.,]*\s*[a-z(])/gi)].pop(); if (fin && !given.has(fin[2].replace(",", ".")) && /\btừ đó|\bsuy ra|\bvậy|\btính được|\bta được|\bnên\b/i.test(stripStep(label))) words.push(canon(`${fin[1]}=${fin[2]}`)); }
    // Không có kết quả chuẩn và không có số đáp án: lấy số ngay sau dấu "=" cuối của bước (kết quả trung gian), bỏ số nhỏ để khỏi khớp nhầm.
    const tail = stripStep(label).split("=").slice(1).pop() ?? "";
    const eq = numsIn(tail).slice(0, 1).filter((n) => !given.has(n) && (n.length >= 3 || n.includes(".")));
    const own = anchors.filter((n) => sol.has(n));
    let must = sets[0] ?? (own.length ? own : eq);
    // Số suy ra (không phải kết quả chuẩn) mà mốc trước đã dùng: mốc sau chỉ khớp bằng dạng chữ hoặc AI duyệt, để "x = 4" không ghi nhận luôn bước thay x=4 hay kết luận.
    if (!sets.length && must.length) { const key = must.join(","); if (seen.has(key)) must = []; else seen.add(key); }
    return { id, label, anchors, must, alt: sets.slice(1), words };
  });
}

// Dạng chữ/biểu thức w có trong tin không (không dính vào số dài hơn: "x=2" không khớp "x=25").
// Chữ số đứng ngay trước w là hệ số hoặc phần của số lớn hơn: "y=1" không khớp "2y=1" hay "3y=1", "2" không khớp "12".
export function hasWord(text: string, w: string) {
  // canon() xóa xuống dòng nên "21-7y=7\ny=2" thành "21-7y=7y=2" và "y=2" bị coi là "7y=2": xét từng dòng riêng trước, rồi mới xét cả đoạn (dạng chữ trải nhiều dòng).
  const lines = text.split(/\n+/);
  if (lines.length > 1 && lines.some((l) => hasWordIn(canon(l), w))) return true;
  return hasWordIn(canon(text), w);
}
function hasWordIn(t: string, w: string) {
  for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + 1)) {
    const nx = t[i + w.length] ?? "", nn = t[i + w.length + 1] ?? "";
    const longer = /\d/.test(nx) || (/[.,]/.test(nx) && /\d/.test(nn)); // x=2 không khớp x=25 hay x=2.5; "x=2." cuối câu thì khớp
    // w bắt đầu bằng số/chữ cái mà ngay trước là chữ số (hệ số); w là "ẩn=số" mà ngay trước là toán tử (x-y=1 là -y=1, x+y=1 là một tổng, không phải y=1)
    const glued = (/^[\da-z]/i.test(w) && /\d/.test(t[i - 1] ?? "")) || (/^[a-z]=/i.test(w) && /[-+*/^)]/.test(t[i - 1] ?? ""));
    if (!longer && !glued) return true;
  }
  return false;
}

// Gỡ những câu/dòng học sinh chép lại nguyên văn từ đề (hoặc dán cả trang chứa đề): đó không phải lời giải, nhưng có thể chứa sẵn chữ của mốc
// (ví dụ "cửa hàng B"). Chỉ so với đề bài, không so với lời bot (học sinh được phép gõ lại lời giải bước đã hiện).
export function stripEcho(text: string, sources: string[]) {
  const src = canon(sources.join("\n"));
  const trim = (s: string) => canon(s).replace(/[.!?:;,]+$/, "");
  return text.split(/\n+|(?<=[.!?])\s+/).filter((seg) => { const c = trim(seg); return c.length < 12 || !src.includes(c); }).join("\n").trim();
}

// Mốc đủ khi tin của học sinh có mọi số của mốc, hoặc một bộ số khác được chấp nhận, hoặc đúng dạng chữ/biểu thức chuẩn.
export const met = (c: Cp, text: string) =>
  (c.must.length > 0 && c.must.every((n) => hasNum(text, n))) || !!c.alt?.some((s) => s.every((n) => hasNum(text, n))) || !!c.words?.some((w) => hasWord(text, w));

// Kiểu "từng bước": đúng thứ tự. Mốc chỉ được ghi nhận khi mọi mốc trước đã xong; một tin gộp nhiều mốc liên tiếp thì ghi nhận hết.
// Nhảy cóc (viết kết quả bước sau khi bước hiện tại chưa xong) không ghi nhận gì.
// Các số làm mốc c khớp trong tin (null nếu không khớp). Mốc khớp bằng dạng chữ thì lấy số trong dạng chữ đó.
const evidence = (c: Cp, text: string): string[] | null => {
  if (c.must.length > 0 && c.must.every((n) => hasNum(text, n))) return c.must;
  const alt = c.alt?.find((s) => s.every((n) => hasNum(text, n)));
  if (alt) return alt;
  const w = c.words?.find((x) => hasWord(text, x));
  return w === undefined ? null : numsIn(w);
};

// Mốc đầu tiên khớp luôn được ghi nhận. Các mốc liền sau trong CÙNG một tin chỉ được gộp khi có số mới so với các mốc đã ghi nhận trong tin đó:
// tin "x=10 hoặc x=-12" khớp luôn mốc chọn nghiệm và mốc kết luận chỉ nhờ cùng số 10, không phải bằng chứng cho hai bước sau.
// ok: các mốc không có số mà AI đã duyệt (server đã kiểm bằng chứng): ghi nhận như mốc khớp, không thêm số vào seen.
export function markByNumbers(text: string, cps: Cp[], mask: number, ok?: ReadonlySet<number>) {
  const seen = new Set<string>();
  let first = true;
  for (const c of cps) {
    if (mask >> c.id & 1) continue;
    const e = ok?.has(c.id) ? [] : evidence(c, text);
    if (!e) break;
    if (!first && e.length > 0 && e.every((n) => seen.has(n))) break;
    mask |= 1 << c.id;
    e.forEach((n) => seen.add(n));
    first = false;
  }
  return mask;
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

// Lời kết sớm: AI chúc mừng/báo xong khi server chưa xác nhận xong. Bot phải hỏi tiếp thay vì kết.
export const earlyClose = (reply: string) => !reply.includes("?") || /giải xong|chúc mừng|làm tốt lắm|hoàn thành bài/i.test(reply);
export const ASK_METHOD = "Kết quả của bạn đúng rồi. Bạn tính ra kết quả đó bằng phép tính nào? Viết phép tính ra nhé.";
export const ASK_NEXT = "Bài này chưa xong đâu nhé. Bạn thử viết bước tiếp theo của mình được không?";
const ASK_NEXT_Q = "Bạn thử viết bước tiếp theo của mình nhé?";
const ASK_METHOD_Q = "Bạn viết phép tính dẫn tới kết quả đó ra nhé?";

// Phiên chưa xong mà lời AI không dẫn tiếp: có câu hỏi thì giữ nguyên lời AI (khỏi mất phần ghi nhận bài của học sinh);
// không có câu hỏi và không phải lời kết thì nối câu hỏi vào sau; là lời kết thì dùng câu mẫu.
export function keepOrAsk(reply: string, allDone: boolean) {
  if (reply.includes("?")) return reply;
  if (/giải xong|chúc mừng|làm tốt lắm|hoàn thành bài/i.test(reply)) return allDone ? ASK_METHOD : ASK_NEXT;
  return `${reply.trim()} ${allDone ? ASK_METHOD_Q : ASK_NEXT_Q}`;
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
  // Model hay viết "\times" trong JSON với MỘT dấu \ nên bị đọc thành ký tự điều khiển (tab + "imes", form feed + "rac"): trả lại dấu \ trước khi so với bài làm.
  const fixed = evidence.replace(/\t/g, "\\t").replace(/\f/g, "\\f").replace(/\x08/g, "\\b").replace(/\r/g, "\\r").replace(/\x0b/g, "\\v");
  const ev = norm(fixed).replace(/\s+/g, " ").trim().toLowerCase();
  // Trích dẫn thật và số đáp án của mốc đủ. Mốc không có số (nhận xét, nêu cách làm) thì không đòi chữ số: "đối nhau" là câu trả lời đúng.
  return ev.length >= 3 && norm(said).replace(/\s+/g, " ").toLowerCase().includes(ev) && c.must.every((n) => hasNum(said, n));
}

// Bước mà lời giải mẫu viết thành phương trình/đẳng thức: học sinh bắt buộc phải viết có dấu "=" (không nhận lời nói hay hai biểu thức rời nhau).
// Server kiểm cứng, không để AI phán: cùng một tin luôn cho cùng một kết quả.
export const needsEq = (c: Cp) => /[=＝]/.test(stripStep(c.label));
export const hasEq = (t: string) => /[=＝]/.test(t);
export const shapeOk = (c: Cp, said: string) => !needsEq(c) || (hasEq(said) && /\d/.test(said));

// Thanh 5 bước Polya hiển thị: tính từ tiến độ thật, không do AI quyết định.
export const stepOf = (done: number, total: number) => (done >= total ? 5 : Math.min(4, 1 + Math.floor((done / total) * 4)));
