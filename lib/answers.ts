import { nums } from "@/lib/answer-check";

// Đáp án lưu dạng đối tượng {tên: giá trị} (DB, code kiểm tra, chặn lộ). Với người dùng thì hiện và sửa dạng mỗi dòng "tên = giá trị".
// Không import gì ngoài answer-check để dùng được cả ở trình duyệt lẫn server.

const NUM = /^-?\d+(\.\d+)?$/;
const FRAC = /^(-?\d+)\s*\/\s*(\d+)$/;
const DEC_COMMA = /^-?\d+,\d+$/; // 1,5 kiểu Việt Nam
const KEY = /^[\p{L}_][\p{L}\p{N}_]*$/u;

const near = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 0.005 + 1e-9;

// Giá trị một dòng: số thì thành số, phân số a/b thành số thập phân (để chặn lộ và so được), còn lại giữ chữ.
function parseValue(v: string): unknown {
  const t = v.trim();
  if (NUM.test(t)) return Number(t);
  if (DEC_COMMA.test(t)) return Number(t.replace(",", "."));
  const f = t.match(FRAC);
  if (f && Number(f[2])) return +(Number(f[1]) / Number(f[2])).toFixed(6);
  if (/^[[{]/.test(t)) { try { return JSON.parse(t); } catch { /* giữ như chữ */ } }
  return t;
}

export const showValue = (v: unknown) => (typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v));

// Đối tượng đáp án thành các dòng "tên = giá trị".
export function answersToLines(o: Record<string, unknown>): string {
  return Object.entries(o).map(([k, v]) => `${k} = ${showValue(v)}`).join("\n");
}

export type Parsed = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

// Các dòng thành đối tượng đáp án. Báo lỗi rõ theo số dòng: thiếu dấu =, tên không hợp lệ, tên trùng, giá trị rỗng.
// Vẫn nhận JSON {"x": 3} nếu giáo viên dán vào (tương thích cách cũ).
export function linesToAnswers(text: string): Parsed {
  const t = text.trim();
  if (!t) return { ok: true, value: {} };
  if (t.startsWith("{")) {
    try {
      const o = JSON.parse(t);
      if (o && typeof o === "object" && !Array.isArray(o)) return { ok: true, value: o as Record<string, unknown> };
    } catch { /* không phải JSON: đọc như các dòng */ }
  }
  const value: Record<string, unknown> = {};
  const rows = text.split(/\r?\n/);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].trim();
    if (!row) continue;
    const eq = row.indexOf("=");
    if (eq < 0) return { ok: false, error: `Dòng ${i + 1} thiếu dấu =. Viết dạng tên = giá trị, ví dụ x = 3.` };
    const k = row.slice(0, eq).trim(), v = row.slice(eq + 1).trim();
    if (!KEY.test(k)) return { ok: false, error: `Dòng ${i + 1}: tên "${k}" chưa hợp lệ. Dùng chữ cái, số hoặc dấu gạch dưới, ví dụ x hoặc a_x.` };
    if (!v) return { ok: false, error: `Dòng ${i + 1}: thiếu giá trị sau dấu =.` };
    if (k in value) return { ok: false, error: `Dòng ${i + 1}: tên "${k}" bị trùng.` };
    value[k] = parseValue(v);
  }
  return { ok: true, value };
}

// Dòng ket_luan (chữ) chỉ nhắc lại các số đã có ở đáp án khác thì dư: bỏ. Đáp án chữ thật (vô nghiệm, m khác 2) giữ nguyên.
export function dropRedundantSummary(o: Record<string, unknown>): Record<string, unknown> {
  const s = o.ket_luan;
  if (typeof s !== "string") return o;
  const inText = (s.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));
  const rest = { ...o }; delete rest.ket_luan;
  const have = nums(rest);
  if (!inText.length || !inText.every((n) => have.some((h) => near(h, n)))) return o;
  return rest;
}

export type Group = { part: string; items: { key: string; value: unknown }[] };

// Đáp án theo ý: khóa dạng a_x, b_m gom vào ý a, ý b; khóa còn lại ở nhóm không tên (part = "").
export function groupAnswers(o: Record<string, unknown>): Group[] {
  const groups: Group[] = [];
  const get = (part: string) => { let g = groups.find((x) => x.part === part); if (!g) { g = { part, items: [] }; groups.push(g); } return g; };
  for (const [k, v] of Object.entries(dropRedundantSummary(o))) {
    const m = k.match(/^([a-e])_(.+)$/);
    if (m) get(m[1]).items.push({ key: m[2], value: v });
    else get("").items.push({ key: k, value: v });
  }
  return groups.sort((a, b) => (a.part === "" ? 1 : b.part === "" ? -1 : a.part.localeCompare(b.part)));
}

// Một dòng gọn cho chỗ hẹp: "a) x = 2, y = 1; b) m = -6".
export function answersInline(o: Record<string, unknown>): string {
  return groupAnswers(o).map((g) => `${g.part ? `${g.part}) ` : ""}${g.items.map((i) => `${i.key} = ${showValue(i.value)}`).join(", ")}`).join("; ");
}
