import { pick } from "@/lib/chat/canned";

const dot = (g: string) => (/[.?!]$/.test(g) ? g : g + ".");

// Kịch bản phản hồi khi bài làm học sinh nộp chưa đạt. AI nhỏ chọn kịch bản và viết MỘT câu nhắc đúng điều học sinh viết (có rào chặn lộ đáp án, khen);
// câu bị chặn hoặc trống thì rơi về câu mẫu. Không câu nào nêu số thứ tự bước hay việc phải làm tiếp.
export const SCENARIOS = ["dang_do", "thieu_dau_bang", "dung_huong_thieu", "sai_phuong_phap", "sai_so", "sai_dang", "khong_lien_quan", "chua_lam", "hoi_lai", "xin_dap_an", "lac_de"] as const;
export type Scenario = (typeof SCENARIOS)[number];

// Mô tả cho AI chọn.
export const SCENARIO_GUIDE = `- dang_do: tin chỉ là mảnh dở của biểu thức/phép tính (ví dụ "·3²", "2x =", "m=1" rồi dừng), chưa thành phép tính hay phương trình hoàn chỉnh.
- thieu_dau_bang: phần cần một phương trình nhưng tin là biểu thức không có dấu "=" mà ý đã rõ.
- dung_huong_thieu: đúng hướng, dùng đúng dữ kiện của đề nhưng còn thiếu một phần cần thiết (mới làm một phương trình, một vế, một ý).
- sai_phuong_phap: dùng cách/phép biến đổi không phù hợp với bài.
- sai_so: dùng ĐÚNG dữ kiện và đúng cách làm nhưng tính sai hoặc thay sai số.
- sai_dang: ý có thể đúng nhưng cách viết quá mơ hồ để kiểm tra (viết bằng lời chung chung, viết kết quả mà không có phép tính, thiếu ký hiệu...).
- khong_lien_quan: có biểu thức/phương trình/số nhưng KHÔNG dùng dữ kiện của đề (ẩn, hệ, số đề cho), như viết bừa hoặc của bài khác. Số hay phương trình lạ không xuất phát từ đề thì chọn kịch bản này, không chọn sai_so.
- chua_lam: nói chung chung, vô nghĩa, không có biểu thức cụ thể.
- hoi_lai: học sinh đang HỎI hoặc nhờ giải thích chứ chưa nộp bài làm.
- xin_dap_an: đòi đáp án, nhờ làm hộ, nói bó tay.
- lac_de: nói chuyện không liên quan bài Toán (hỏi tên, chào hỏi, chuyện khác).`;

// Lời dẫn trung tính: không khen (phân loại có thể sai, câu khen sẽ thành thông tin sai).
const LEAD: Record<Scenario, readonly string[]> = {
  dang_do: ["Bạn mới viết được một phần.", "Phần bạn viết còn dở dang.", "Mình thấy phần này chưa trọn vẹn."],
  thieu_dau_bang: ["Phần này cần một phương trình đầy đủ, bạn thêm vế còn lại nhé.", "Bạn viết thành phương trình có dấu = nhé."],
  dung_huong_thieu: ["Bạn đang đi đúng hướng nhưng còn thiếu một phần.", "Còn thiếu một phần nữa, bạn xem lại nhé."],
  sai_phuong_phap: ["Cách làm này chưa phù hợp với bài.", "Phép biến đổi này chưa giúp ích cho bài này."],
  sai_so: ["Có một chỗ chưa khớp, bạn soát lại từng phép tính và từng con số nhé.", "Mình thấy có chỗ chưa khớp, bạn kiểm tra lại từng phép tính của mình nhé."],
  sai_dang: ["Cách viết này mình chưa kiểm tra được, bạn viết cụ thể hơn nhé.", "Bạn trình bày lại bằng phép tính cụ thể nhé."],
  khong_lien_quan: ["Mình chưa thấy phần này xuất phát từ đề bài.", "Phần bạn viết chưa dùng dữ kiện của đề.", "Bạn đọc lại đề rồi viết bằng dữ kiện của đề nhé."],
  chua_lam: ["Mình chưa thấy phép tính hay biểu thức cụ thể nào trong tin của bạn.", "Bạn viết ra một biểu thức hay phương trình cụ thể nhé."],
  hoi_lai: ["Có vẻ bạn đang hỏi thay vì nộp bài làm. Muốn hỏi thì bấm Em chưa hiểu nhé."],
  xin_dap_an: ["Mình không nói đáp án được, nhưng bạn bấm Gợi ý để mình gợi ý nhé."],
  lac_de: ["Mình là trợ lý làm bài Toán nên chỉ giúp được trong bài này thôi.", "Chuyện này nằm ngoài bài Toán rồi, mình quay lại bài nhé."],
};

// tries: số lần nộp liên tiếp chưa qua mốc nào. Từ lần 3 trỏ nút Gợi ý.
const help = (sc: Scenario, tries: number) => (tries >= 3 && sc !== "xin_dap_an" && sc !== "hoi_lai" && sc !== "lac_de" ? " Nếu bí, bạn bấm Gợi ý nhé." : "");

// Câu mẫu thuần server: lời dẫn trung tính + (từ lần 3) trỏ nút Gợi ý.
export function scenarioReply(sc: Scenario, tries: number, last?: string) {
  return `${pick(LEAD[sc], last)}${help(sc, tries)}`.trim();
}

// Câu do AI viết (nhắc đúng điều học sinh viết, chỉ chỗ sai).
export function withAiLine(sc: Scenario, ai: string, tries: number) {
  return `${dot(ai.trim())}${help(sc, tries)}`.trim();
}
