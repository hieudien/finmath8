
// Nhãn tiếng Việt cho các khóa thường gặp trong data/solution. Khóa lạ thì hiện nguyên tên.
const LABEL: Record<string, [string, string?]> = {
  budget: ["Ngân sách", "đồng"], price: ["Giá", "đồng"], target: ["Mục tiêu", "đồng"], saved: ["Đã có", "đồng"], weekly: ["Tiết kiệm mỗi tuần", "đồng"],
  discount_A: ["Giảm giá ở A"], discount_B: ["Giảm giá ở B"], fee_A: ["Phí ở A", "đồng"], fee_B: ["Phí ở B", "đồng"],
  cost_A: ["Phải trả ở A", "đồng"], cost_B: ["Phải trả ở B", "đồng"], cost_KM1: ["Phải trả theo KM1", "đồng"], cost_KM2: ["Phải trả theo KM2", "đồng"],
  best: ["Lựa chọn tốt nhất"], difference: ["Chênh lệch", "đồng"], weeks: ["Số tuần", "tuần"], equation: ["Phương trình"],
  equal_at_gb: ["Hai gói bằng nhau khi dùng", "GB"], used_gb: ["Đã dùng", "GB"],
  principal: ["Tiền gốc", "đồng"], rate: ["Lãi suất"], years: ["Số năm", "năm"], simple_total: ["Nhận được (lãi đơn)", "đồng"], compound_total: ["Nhận được (lãi kép)", "đồng"],
  down_payment: ["Trả trước", "đồng"], loan: ["Số tiền vay", "đồng"], interest: ["Tiền lãi", "đồng"], total: ["Tổng phải trả", "đồng"], monthly: ["Trả mỗi tháng", "đồng"], extra_vs_cash: ["Đắt hơn trả tiền mặt", "đồng"],
  remaining_budget: ["Ngân sách còn lại", "đồng"], max_per_day: ["Tối đa mỗi ngày", "đồng"],
  buy_value: ["Giá trị mua", "đồng"], sell_value: ["Giá trị bán", "đồng"], fee: ["Phí bán", "đồng"], net_profit: ["Lãi ròng", "đồng"], return_percent: ["Tỉ suất sinh lời", "%"], bank_interest: ["Lãi gửi ngân hàng", "đồng"],
  months: ["Số tháng", "tháng"], monthly_rate: ["Lãi suất mỗi tháng"], down_percent: ["Trả trước (theo giá xe)"], down_payment_percent: ["Trả trước"],
  shares: ["Số cổ phiếu"], buy_price: ["Giá mua mỗi cổ phiếu", "đồng"], sell_price: ["Giá bán mỗi cổ phiếu", "đồng"], fee_rate: ["Tỉ lệ phí bán"], bank_rate: ["Lãi suất ngân hàng mỗi năm"],
  km1_percent: ["KM1 giảm"], km2_fixed: ["KM2 giảm trước", "đồng"], km2_percent: ["KM2 giảm thêm"],
  A_fee: ["Cước cố định gói A", "đồng"], A_included_gb: ["Gói A gồm", "GB"], A_extra_per_gb: ["Gói A, mỗi GB vượt", "đồng"], B_fee: ["Cước cố định gói B", "đồng"], B_included_gb: ["Gói B gồm", "GB"],
  ticket: ["Tiền vé mỗi bạn", "đồng"], bus: ["Tiền thuê xe chung", "đồng"], per_person_total: ["Mỗi bạn trả tổng cộng", "đồng"],
  price_before_vat: ["Giá chưa VAT", "đồng"], vat: ["Thuế VAT"], A_discount: ["Cửa hàng A giảm"], B_fixed_discount: ["Cửa hàng B trừ thẳng", "đồng"],
  drinks: ["Tiền nước uống cả tuần", "đồng"], days_spent: ["Số ngày đã chi", "ngày"], per_day_spent: ["Chi mỗi ngày", "đồng"], days_left: ["Số ngày còn lại", "ngày"],
  students: ["Số bạn", "bạn"],
};

export const labelOf = (k: string) => LABEL[k]?.[0] ?? k.replace(/_/g, " ");

export function asFraction(v: number): string | null {
  if (!Number.isFinite(v) || Number.isInteger(v) || (String(v).split(".")[1] ?? "").length < 4) return null;
  for (let q = 2; q <= 200; q++) {
    const p = Math.round(Math.abs(v) * q);
    if (Math.abs(Math.abs(v) - p / q) < 1e-6) return `$${v < 0 ? "-" : ""}\\frac{${p}}{${q}}$`;
  }
  return null;
}

export function fmtValue(k: string, v: unknown): string {
  const unit = LABEL[k]?.[1];
  if (typeof v === "number") {
    // Tỉ lệ dạng thập phân (0,15) của giảm giá, lãi suất, thuế... hiện thành phần trăm (15%).
    if (/discount|rate|percent|vat/i.test(k) && v > 0 && v < 1) return `${+(v * 100).toFixed(2)}%`.replace(".", ",");
    // Số thập phân vô hạn đã bị làm tròn (4,666667) hiện lại thành phân số; số thập phân ngắn (0,4) giữ nguyên.
    const fr = asFraction(v);
    if (fr) return fr;
    const n = v.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
    return unit ? `${n}${unit === "%" ? "%" : " " + unit}` : n;
  }
  if (typeof v === "boolean") return v ? "Có" : "Không";
  if (Array.isArray(v)) return v.join(", ");
  if (v && typeof v === "object") return JSON.stringify(v);
  return String(v ?? "");
}

export const entries = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => ({ key: k, label: labelOf(k), value: fmtValue(k, v) }));
