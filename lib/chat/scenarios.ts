import { pick } from "@/lib/chat/canned";

const dot = (g: string) => (/[.?!]$/.test(g) ? g : g + ".");

// Kịch bản phản hồi khi bước học sinh nộp chưa đạt. AI nhỏ chọn kịch bản và viết MỘT câu nhắc đúng điều học sinh viết (có rào chặn lộ đáp án, khen);
// câu bị chặn hoặc trống thì rơi về câu mẫu ghép từ lời dẫn + việc cần làm + dạng cần viết của bước (các phần này đã qua kiểm lộ đáp án).
export const SCENARIOS = ["dang_do", "thieu_dau_bang", "dung_huong_thieu", "sai_phuong_phap", "sai_so", "sai_dang", "khong_lien_quan", "chua_lam", "hoi_lai", "xin_dap_an", "lac_de"] as const;
export type Scenario = (typeof SCENARIOS)[number];

// Mô tả cho AI chọn.
export const SCENARIO_GUIDE = `- dang_do: tin chỉ là mảnh dở của biểu thức/phép tính (ví dụ "·3²", "2x =", "m=1" rồi dừng), chưa thành phép tính hay phương trình hoàn chỉnh.
- thieu_dau_bang: bước cần một phương trình nhưng tin là biểu thức không có dấu "=" mà ý đã rõ.
- dung_huong_thieu: đúng hướng, dùng đúng dữ kiện của đề nhưng còn thiếu một phần cần thiết (mới làm một phương trình, một vế, một ý).
- sai_phuong_phap: dùng cách/phép biến đổi không phù hợp với việc của bước.
- sai_so: dùng ĐÚNG dữ kiện và đúng cách làm của bước nhưng tính sai hoặc thay sai số.
- sai_dang: ý có thể đúng nhưng cách viết không theo dạng bước yêu cầu (viết bằng lời, viết kết quả thay vì phép thay, thiếu ký hiệu...).
- khong_lien_quan: có biểu thức/phương trình/số nhưng KHÔNG dùng dữ kiện của đề (ẩn, hệ, số đề cho), như viết bừa hoặc của bài khác. Số hay phương trình lạ không xuất phát từ đề thì chọn kịch bản này, không chọn sai_so.
- chua_lam: nói chung chung, vô nghĩa, không có biểu thức cụ thể.
- hoi_lai: học sinh đang HỎI hoặc nhờ giải thích chứ chưa nộp bước.
- xin_dap_an: đòi đáp án, nhờ làm hộ, nói bó tay.
- lac_de: nói chuyện không liên quan bài Toán (hỏi tên, chào hỏi, chuyện khác).`;

// Lời dẫn trung tính: không khen (phân loại có thể sai, câu khen sẽ thành thông tin sai).
const LEAD: Record<Scenario, readonly string[]> = {
  dang_do: ["Bạn mới viết được một phần.", "Phần bạn viết còn dở dang.", "Mình thấy phần này chưa trọn vẹn."],
  thieu_dau_bang: ["Bước này cần một phương trình đầy đủ, bạn thêm vế còn lại nhé.", "Bạn viết thành phương trình có dấu = nhé."],
  dung_huong_thieu: ["Bạn đang đi đúng hướng nhưng còn thiếu một phần.", "Còn thiếu một phần nữa, bạn xem lại nhé."],
  sai_phuong_phap: ["Cách làm này chưa phù hợp với việc của bước này.", "Phép biến đổi này chưa giúp ích cho bước này."],
  sai_so: ["Có một chỗ chưa khớp, bạn soát lại từng phép tính và từng con số nhé.", "Mình thấy có chỗ chưa khớp, bạn kiểm tra lại từng bước tính của mình nhé."],
  sai_dang: ["Cách viết này chưa theo yêu cầu của bước.", "Bạn trình bày lại theo yêu cầu của bước nhé."],
  khong_lien_quan: ["Mình chưa thấy phần này xuất phát từ đề bài.", "Phần bạn viết chưa dùng dữ kiện của đề.", "Bạn đọc lại đề rồi viết bằng dữ kiện của đề nhé."],
  chua_lam: ["Mình chưa thấy phép tính hay biểu thức cụ thể nào trong tin của bạn.", "Bạn viết ra một biểu thức hay phương trình cụ thể nhé."],
  hoi_lai: ["Có vẻ bạn đang hỏi thay vì nộp bước. Muốn hỏi thì bấm Em chưa hiểu nhé."],
  xin_dap_an: ["Mình không nói đáp án được, nhưng bạn bấm Gợi ý để được chỉ từng chút nhé."],
  lac_de: ["Mình là trợ lý làm bài Toán nên chỉ giúp được trong bài này thôi.", "Chuyện này nằm ngoài bài Toán rồi, mình quay lại bài nhé."],
};

// Dọn dạng cần viết của đề cũ: bỏ động từ "Viết" đầu câu và cụm về bố cục ("mỗi phương trình một dòng có dấu =").
export function cleanFormat(f: string) {
  const t = f.trim().replace(/[,;]?\s*mỗi phương trình (?:một dòng|viết trên một dòng)[^,.;]*/gi, "").replace(/^(?:viết|lập|tính)(?: lại| ra)?\s+/i, "").replace(/[\s,.;:]+$/, "");
  return t ? t[0].toLowerCase() + t.slice(1) : "";
}

type Step = { no: number; n: number; goal: string; format: string; tries?: number };
// Câu nhắc việc cần làm: lần đầu khung trên ô nhập đã hiện sẵn nên bỏ; từ lần 2 mới nhắc.
const tail = (sc: Scenario, step: Step) => {
  const tries = step.tries ?? 1;
  const ask = sc === "xin_dap_an" || sc === "hoi_lai" || sc === "lac_de";
  const f = ask ? "" : cleanFormat(step.format);
  const fmt = f ? ` Bạn thử viết ra ${f} nhé.` : "";
  const cue = tries >= 2 || ask ? ` Việc cần làm ở bước ${step.no}/${step.n}: ${step.goal ? dot(step.goal) : "bạn viết bước này nhé."}` : "";
  const help = tries >= 3 && !ask ? " Nếu bí, bạn bấm Gợi ý nhé." : "";
  return { cue, fmt, help };
};

// Câu mẫu thuần server: lời dẫn trung tính + (từ lần 2) việc cần làm + dạng cần viết + (từ lần 3) trỏ nút Gợi ý.
export function scenarioReply(sc: Scenario, step: Step, last?: string) {
  const t = tail(sc, step);
  return `${pick(LEAD[sc], last)}${t.cue}${t.fmt}${t.help}`.trim();
}

// Câu do AI viết (nhắc đúng điều học sinh viết, chỉ chỗ sai). Nếu AI đã chỉ được chỗ sai/thiếu thì để câu đó đứng một mình: không dán lại việc cần làm hay dạng cần viết.
// Chỉ các kịch bản học sinh chưa ra đúng đối tượng cần viết mới kèm dạng cần viết (lần 1) và việc cần làm (từ lần 2).
const NEEDS_GUIDE = new Set<Scenario>(["dang_do", "chua_lam", "sai_dang", "khong_lien_quan"]);
export function withAiLine(sc: Scenario, ai: string, step: Step) {
  if (!NEEDS_GUIDE.has(sc)) return dot(ai.trim());
  const t = tail(sc, step);
  return `${dot(ai.trim())}${t.cue}${t.fmt}`.trim();
}
