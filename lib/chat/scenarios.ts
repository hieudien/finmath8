import { pick } from "@/lib/chat/canned";

const dot = (g: string) => (/[.?!]$/.test(g) ? g : g + ".");

// Kịch bản phản hồi khi bước học sinh nộp chưa đạt. AI nhỏ chỉ CHỌN kịch bản; lời nói do server ghép từ câu mẫu + việc cần làm + dạng cần viết của bước
// (các phần này đã qua kiểm lộ đáp án), nên không lộ kết quả và cùng input cho cùng câu.
export const SCENARIOS = ["dang_do", "thieu_dau_bang", "dung_huong_thieu", "sai_phuong_phap", "sai_so", "sai_dang", "chua_lam", "hoi_lai", "xin_dap_an"] as const;
export type Scenario = (typeof SCENARIOS)[number];

// Mô tả cho AI chọn (khớp thứ tự SCENARIOS).
export const SCENARIO_GUIDE = `- dang_do: tin chỉ là mảnh dở của biểu thức/phép tính (ví dụ "·3²", "2x =", "m=1" rồi dừng), chưa thành phép tính hay phương trình hoàn chỉnh.
- thieu_dau_bang: bước cần một phương trình nhưng tin là biểu thức không có dấu "=" mà ý đã rõ.
- dung_huong_thieu: đúng hướng nhưng còn thiếu một phần cần thiết (mới làm một phương trình, một vế, một ý).
- sai_phuong_phap: dùng cách/phép biến đổi không phù hợp với việc của bước.
- sai_so: đúng cách làm nhưng tính sai hoặc thay sai số.
- sai_dang: ý có thể đúng nhưng cách viết không theo dạng bước yêu cầu (viết bằng lời, viết kết quả thay vì phép thay, thiếu ký hiệu...).
- chua_lam: nói chung chung, vô nghĩa, không có biểu thức cụ thể.
- hoi_lai: học sinh đang HỎI hoặc nhờ giải thích chứ chưa nộp bước.
- xin_dap_an: đòi đáp án, nhờ làm hộ, nói bó tay.`;

const LEAD: Record<Scenario, readonly string[]> = {
  dang_do: ["Bạn mới viết được một phần.", "Mình thấy bạn viết dở dang, chưa thành một phép tính đầy đủ.", "Phần bạn viết chưa trọn vẹn."],
  thieu_dau_bang: ["Ý của bạn có vẻ ổn, nhưng bước này cần viết thành phương trình có dấu =.", "Bạn thử viết lại thành phương trình có dấu = nhé."],
  dung_huong_thieu: ["Bạn đang đi đúng hướng nhưng còn thiếu một phần.", "Hướng làm của bạn ổn, bạn bổ sung nốt phần còn thiếu nhé."],
  sai_phuong_phap: ["Cách làm này chưa phù hợp với việc của bước này.", "Bạn thử đổi hướng, cách này chưa đúng việc của bước."],
  sai_so: ["Cách làm của bạn ổn nhưng có chỗ tính hoặc thay số chưa khớp. Bạn kiểm tra lại từng phép tính nhé.", "Có chỗ chưa khớp trong phép tính. Bạn rà lại từng số một nhé."],
  sai_dang: ["Ý của bạn có thể đúng nhưng cách viết chưa theo yêu cầu của bước.", "Bạn viết lại theo đúng dạng bước yêu cầu nhé."],
  chua_lam: ["Bạn chưa viết ra phép tính hay biểu thức cụ thể.", "Mình chưa thấy bước giải cụ thể nào trong tin của bạn."],
  hoi_lai: ["Có vẻ bạn đang hỏi thay vì nộp bước. Muốn hỏi thì bấm Em chưa hiểu nhé."],
  xin_dap_an: ["Mình không nói đáp án được, nhưng bạn bấm Gợi ý để được chỉ từng chút nhé."],
};

export const isScenario = (x: unknown): x is Scenario => (SCENARIOS as readonly unknown[]).includes(x);

// goal: việc cần làm (đã kiểm lộ), format: dạng cần viết (rỗng nếu đề chưa có). Ghép: lời dẫn + việc cần làm + dạng cần viết.
export function scenarioReply(sc: Scenario, step: { no: number; n: number; goal: string; format: string }, last?: string) {
  const cue = `Việc cần làm ở bước ${step.no}/${step.n}: ${step.goal ? dot(step.goal) : "bạn viết bước này nhé."}`;
  const fmt = step.format && sc !== "xin_dap_an" && sc !== "hoi_lai" ? ` Cần viết: ${dot(step.format)}` : "";
  return `${pick(LEAD[sc], last)} ${cue}${fmt}`;
}
