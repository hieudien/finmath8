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

export const stripStep = (s: string) => s.replace(/^Bước \d+\s*[:.)-]\s*/i, "");

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

const words = (t: string) => t.toLowerCase().match(/[\p{L}\d]+/gu) ?? [];
// Độ giống 0..1 giữa hai câu (Jaccard theo tập từ): bot lặp lại câu trước thì > 0.8.
export function sim(a: string, b: string) {
  const x = new Set(words(a)), y = new Set(words(b));
  const n = [...x].filter((w) => y.has(w)).length;
  return x.size + y.size ? n / (x.size + y.size - n) : 0;
}

export const SOS_REPLY = "Mình nghe bạn rồi. Chuyện này quan trọng hơn bài toán, bạn hãy nói với thầy cô hoặc người lớn bạn tin tưởng nhé. Khi nào sẵn sàng, mình cùng làm tiếp bài.";
