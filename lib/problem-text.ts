import type { Problem } from "@/lib/schema/problem";
import { groupAnswers } from "@/lib/answers";

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

export function fmtValue(k: string, v: unknown): string {
  const unit = LABEL[k]?.[1];
  if (typeof v === "number") {
    // Tỉ lệ dạng thập phân (0,15) của giảm giá, lãi suất, thuế... hiện thành phần trăm (15%).
    if (/discount|rate|percent|vat/i.test(k) && v > 0 && v < 1) return `${+(v * 100).toFixed(2)}%`.replace(".", ",");
    const n = v.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
    return unit ? `${n}${unit === "%" ? "%" : " " + unit}` : n;
  }
  if (typeof v === "boolean") return v ? "Có" : "Không";
  if (Array.isArray(v)) return v.join(", ");
  if (v && typeof v === "object") return JSON.stringify(v);
  return String(v ?? "");
}

export const entries = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => ({ key: k, label: labelOf(k), value: fmtValue(k, v) }));

// Toàn bộ đề, lời giải, kết quả ở dạng văn bản thuần: để sao chép sang Word hoặc in.
export function problemToText(p: Problem): string {
  const line = (e: { label: string; value: string }) => `- ${e.label}: ${e.value}`;
  const out: string[] = [`${p.id}. ${p.title}`, p.topic ? `Chủ đề: ${p.topic} (Lớp ${p.grade})` : `Lớp ${p.grade}`, ""];
  out.push("ĐỀ BÀI", p.statement ?? "(Đề chưa có phần nội dung bài)", "");
  if (Object.keys(p.data).length) out.push("DỮ KIỆN", ...entries(p.data).map(line), "");
  out.push("LỜI GIẢI", ...(p.solution_steps.length ? p.solution_steps.map((s, i) => `Bước ${i + 1}. ${s}`) : ["(Chưa có lời giải từng bước)"]), "");
  out.push("KẾT QUẢ", ...groupAnswers(p.solution).flatMap((g) => (g.part === ""
    ? entries(Object.fromEntries(g.items.map((i) => [i.key, i.value]))).map(line)
    : g.items.map((i) => line({ label: `Ý ${g.part}) ${labelOf(i.key)}`, value: fmtValue(i.key, i.value) })))), "");
  if (p.common_errors.length) out.push("SAI LẦM THƯỜNG GẶP", ...p.common_errors.map((e) => `- ${e}`), "");
  out.push("GỢI Ý CHO HỌC SINH", ...[...p.hints].sort((a, b) => a.level - b.level).map((h) => `Mức ${h.level}: ${h.text}`));
  if (p.extension) out.push("", "CÂU HỎI MỞ RỘNG", p.extension);
  return out.join("\n");
}
