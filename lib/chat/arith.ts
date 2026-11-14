import { norm } from "@/lib/chat/progress";

// Tầng 0 kiểm bài làm: server tự bắt phép so sánh và phép tính số học sai, không gọi model. Module thuần.
// Chỉ xét biểu thức toàn số (+ - × ÷, ngoặc) và so sánh hai số; có chữ cái dính vào biểu thức (đại số: 2x - 3) thì bỏ qua để không báo nhầm.

type Tok = string;
// Tính biểu thức số học nhỏ (không dùng eval). Trả null nếu không hợp lệ.
export function calc(src: string): number | null {
  const t: Tok[] = src.match(/\d+(?:\.\d+)?|[()+\-*/]/g) ?? [];
  if (t.join("") !== src.replace(/\s+/g, "")) return null;
  let i = 0;
  const atom = (): number | null => {
    const x = t[i++];
    if (x === undefined) return null;
    if (x === "(") { const v = sum(); if (t[i++] !== ")") return null; return v; }
    if (x === "-") { const v = atom(); return v === null ? null : -v; }
    return /^\d/.test(x) ? Number(x) : null;
  };
  const prod = (): number | null => {
    let v = atom();
    while (v !== null && (t[i] === "*" || t[i] === "/")) { const op = t[i++]; const r = atom(); if (r === null) return null; v = op === "*" ? v * r : v / r; }
    return v;
  };
  const sum = (): number | null => {
    let v = prod();
    while (v !== null && (t[i] === "+" || t[i] === "-")) { const op = t[i++]; const r = prod(); if (r === null) return null; v = op === "+" ? v + r : v - r; }
    return v;
  };
  const v = sum();
  return v !== null && i === t.length && Number.isFinite(v) ? v : null;
}

// Giá trị của mọi phép tính số học học sinh VIẾT RA trong bài làm (nhóm trong ngoặc, hoặc "a ⊕ b"), kể cả khi chưa viết "= kết quả".
// Dùng để ghi nhận phép tính trung gian nằm trong một biểu thức gộp, ví dụ "(12 + 8) × 2 = 40" có phép 12 + 8 (= 20).
export function impliedNums(text: string): Set<string> {
  const t = norm(text).replace(/(?<=[\d)])\s*[x×·*]\s*(?=[\d(])/gi, "*").replace(/(?<=[\d)])\s*[÷:]\s*(?=[\d(])/g, "/").replace(/[−–]/g, "-");
  const out = new Set<string>();
  const add = (src: string) => { const v = calc(src); if (v !== null && v >= 0) out.add(String(+v.toFixed(4))); };
  for (const m of t.matchAll(/\(([\d.+\-*/\s()]+)\)/g)) add(m[1]);
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*([+\-*/])\s*(\d+(?:\.\d+)?)/g)) add(m[0]);
  return out;
}

// Câu báo cho một phần tử của badClaims. Đẳng thức mà vế phải không bằng giá trị vế trái là lỗi KẾT QUẢ: nói rõ để học sinh không hiểu là cách làm hay phép tính sai.
// Không nêu giá trị đúng. RESULT_MARK dùng để nhận ra câu này ở các lượt sau (hỏi, gợi ý).
export const RESULT_MARK = "kết quả sau dấu = không bằng";
export const claimNote = (c: string) => /[<>]|nên/.test(c)
  ? `Mình thấy "${c}" chưa đúng, bạn kiểm tra lại dòng đó nhé.`
  : `Mình thấy "${c}" chưa khớp: ${RESULT_MARK} giá trị của phép tính bên trái, bạn tính lại kết quả nhé.`;

// Dung sai rộng vì phân số (1/3) đã bị norm làm tròn 4 chữ số thập phân.
const close = (a: number, b: number) => Math.abs(a - b) <= 2e-3 * Math.max(1, Math.abs(a), Math.abs(b));
const isLetter = (c: string) => /[\p{L}^_]/u.test(c);

// Phép so sánh và phép tính sai trong một đoạn bài làm: mỗi phần tử là đoạn trích của chính học sinh.
export function badClaims(text: string): string[] {
  // x, ×, · giữa hai số là dấu nhân; ÷ và : giữa hai số là dấu chia.
  // Học sinh hay viết phép tính bằng chữ giữa hai số: "(12 + 8) nhân 2 = 41" phải được kiểm như "(12 + 8) × 2 = 41".
  const t = norm(text).replace(/(?<=[\d)])\s+nhân\s+(?=[\d(])/gi, "*").replace(/(?<=[\d)])\s+chia\s+(?=[\d(])/gi, "/").replace(/(?<=[\d)])\s+cộng\s+(?=[\d(])/gi, "+").replace(/(?<=[\d)])\s+trừ\s+(?=[\d(])/gi, "-")
    .replace(/(?<=[\d)])\s*[x×·*]\s*(?=[\d(])/gi, "*").replace(/(?<=[\d)])\s*[÷:]\s*(?=[\d(])/g, "/").replace(/[−–]/g, "-").replace(/≤/g, "<=").replace(/≥/g, ">=");
  const out: string[] = [];
  // So sánh: từng cặp số kề nhau qua dấu so sánh (chuỗi a < b < c xét từng cặp).
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)(?=\s*(<=|>=|<|>)\s*(\d+(?:\.\d+)?))/g)) {
    const a = Number(m[1]), b = Number(m[3]), op = m[2];
    const ok = op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : a >= b;
    if (!ok) out.push(`${m[1]} ${op} ${m[3]}`);
  }
  // Đẳng thức: các cặp kề nhau trong chuỗi "e1 = e2 = e3", mỗi vế lấy biểu thức số ở sát dấu "=".
  for (const line of t.split("\n")) {
    // Học sinh chủ ý viết đẳng thức sai để chỉ ra mâu thuẫn ("6 = 5, vô lý"): không báo.
    if (/vô lý|vô lí|mâu thuẫn|không xảy ra|vô nghiệm/i.test(line)) continue;
    const parts = line.split(/=/);
    for (let k = 0; k + 1 < parts.length; k++) {
      const left = /[\d.()+\-*/\s]*$/.exec(parts[k])![0], right = /^[\d.()+\-*/\s]*/.exec(parts[k + 1])![0];
      // Chỉ chữ cái DÍNH liền biểu thức (2x, 5y) mới là đại số; khoảng trắng rồi mới tới chữ (lời văn) thì không.
      const before = left.startsWith(" ") || left.startsWith("\n") ? " " : parts[k].slice(0, parts[k].length - left.length).slice(-1);
      const after = /\s$/.test(right) ? " " : parts[k + 1].slice(right.length)[0] ?? "";
      const l = left.trim(), r = right.trim();
      // Lời văn kiểu "7 nhân 2 = 14": biểu thức bắt được chỉ là một phần ("2"), nên bỏ qua khi đứng sau từ chỉ phép tính, hoặc chỉ là một số trơn.
      const prev = (parts[k].slice(0, parts[k].length - left.length).trim().split(/\s+/).pop() ?? "").toLowerCase();
      if (/^(nhân|chia|cộng|trừ|với|và|lấy|thêm|bớt|gấp|bằng)$/.test(prev) || !/[+\-*/]/.test(l)) continue;
      if (!/^[\d(]/.test(l) || !/^[\d(-]/.test(r) || (before && isLetter(before)) || (after && isLetter(after))) continue;
      const a = calc(l), b = calc(r);
      if (a !== null && b !== null && !close(a, b)) out.push(`${l.replace(/\*/g, " × ").replace(/\//g, " : ").replace(/\s+/g, " ")} = ${r}`);
    }
  }
  // "ax + b = c nên x = e": thay e vào phương trình ngay trước, hai vế phải bằng nhau (bắt bước giải sai như "19x = 36 nên x = 2").
  // Chỉ xét phương trình một ẩn toàn số; còn chữ khác (hai ẩn, lời văn dính vào) thì bỏ qua.
  for (const line of t.split("\n")) {
    if (/vô lý|vô lí|mâu thuẫn|không xảy ra|vô nghiệm/i.test(line)) continue;
    for (const m of line.matchAll(/([^=\n]+)=([^=\n]+?)\s*(?:nên|suy ra|⇒|=>|→|do đó|vậy)\s*([a-zA-Z])\s*=\s*(-?\d+(?:\.\d+)?)(?![\d.]*\s*[a-zA-Z(])/g)) {
      const v = m[3], e = m[4];
      const suffix = new RegExp(`[\\d.()+\\-*/ ${v}]+$`).exec(m[1])?.[0] ?? "";
      const sub = (s: string) => s.replace(new RegExp(`(\\d|\\))\\s*${v}`, "g"), `$1*(${e})`).replace(new RegExp(v, "g"), `(${e})`).replace(/(\d|\))\s*\(/g, "$1*(");
      const ls = sub(suffix.trim()), rs = sub(m[2].trim());
      if (!suffix.includes(v) || /[a-zA-Z]/.test(ls + rs)) continue;
      const a = calc(ls), b = calc(rs);
      if (a !== null && b !== null && !close(a, b)) out.push(`${suffix.trim()} = ${m[2].trim()} nên ${v} = ${e}`);
    }
  }
  return [...new Set(out)];
}
