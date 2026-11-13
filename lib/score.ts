// Điểm lưu trong DB là tổng 4 tiêu chí × 0–3 (0–12). Hiển thị quy đổi sang thang 10.
export const MAX_RAW = 12;
export const SCALE = 10;

// Điểm một phiên: làm tròn đến 0,5.
export const toTen = (raw: number) => Math.round(((raw * SCALE) / MAX_RAW) * 2) / 2;
// Điểm trung bình nhiều phiên: giữ 1 chữ số thập phân.
export const avgTen = (raw: number) => Math.round(((raw * SCALE) / MAX_RAW) * 10) / 10;

// Điểm trung bình một tiêu chí (0–3) quy sang thang 10, làm tròn đến 0,5.
export const MAX_CRIT = 3;
export const critTen = (v: number) => Math.round(((v * SCALE) / MAX_CRIT) * 2) / 2;

// Gom phân bố tổng điểm (từ SQL: name = tổng 0–12, value = số phiên) thành 5 khoảng trên thang 10.
export const TEN_BANDS = ["0–2", "2,5–4", "4,5–6", "6,5–8", "8,5–10"] as const;
export function bandsTen(dist: { name: string; value: number }[]) {
  const out = TEN_BANDS.map((name) => ({ name, value: 0 }));
  for (const d of dist) {
    const t = toTen(Number(d.name));
    out[t <= 2 ? 0 : t <= 4 ? 1 : t <= 6 ? 2 : t <= 8 ? 3 : 4].value += d.value;
  }
  return out;
}
