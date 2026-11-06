export type Provider = "gemini" | "openai";

export type ModelInfo = { id: string; name: string; desc: string };
export type ProviderInfo = {
  label: string;
  keyUrl: string;
  keySteps: string[];
  keyNote: string;
  defaultModel: string;
  models: ModelInfo[];
};

// Danh sách theo tài liệu từng hãng (kiểm tra 11/2026). Model đổi nhanh nên form có thêm ô "Model khác".
export const PROVIDERS: Record<Provider, ProviderInfo> = {
  gemini: {
    label: "Google Gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    keySteps: [
      "Mở Google AI Studio và đăng nhập bằng tài khoản Google.",
      "Bấm \"Create API key\" (Tạo khóa API), chọn hoặc tạo một project.",
      "Chép key (bắt đầu bằng AIza...) rồi dán vào ô bên dưới.",
    ],
    keyNote: "Gói miễn phí giới hạn số lượt gọi mỗi ngày cho từng model. Cả lớp dùng chung thì nên bật thanh toán (billing) cho project.",
    defaultModel: "gemini-3.5-flash",
    models: [
      { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", desc: "Nhanh, chất lượng tốt, cân bằng giá. Khuyến nghị. Gói miễn phí hết lượt trong ngày khá nhanh." },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", desc: "Nhẹ và rẻ nhất, trả lời nhanh. Dùng khi Flash hết lượt. Câu gợi ý có thể kém tinh tế hơn." },
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", desc: "Bản mới hơn của dòng Flash. Hay báo quá tải (lỗi 503) lúc đông người dùng." },
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (preview)", desc: "Mạnh nhất về suy luận, chậm hơn và tốn lượt hơn. Bản thử nghiệm, có thể đổi hoặc ngừng." },
    ],
  },
  openai: {
    label: "OpenAI (ChatGPT)",
    keyUrl: "https://platform.openai.com/api-keys",
    keySteps: [
      "Mở OpenAI Platform và đăng nhập (tài khoản API khác tài khoản ChatGPT Plus).",
      "Vào Billing, nạp trước một ít tiền (API không chạy khi chưa có số dư).",
      "Vào API keys, bấm \"Create new secret key\", chép key (bắt đầu bằng sk-...). Key chỉ hiện một lần.",
    ],
    keyNote: "OpenAI tính tiền theo lượng dùng, không có gói miễn phí cố định. Nên đặt hạn mức chi tiêu hàng tháng trong phần Billing.",
    defaultModel: "gpt-6-luna",
    models: [
      { id: "gpt-6-luna", name: "GPT-6 Luna", desc: "Tiết kiệm nhất, dành cho việc lặp lại nhiều. Phù hợp chatbot cho cả lớp." },
      { id: "gpt-6.1-terra", name: "GPT-6.1 Terra", desc: "Nhanh, viết tự nhiên, hiểu hình và số liệu tốt. Tầm giữa về giá." },
      { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", desc: "Gần bằng Astra ở việc khó nhưng rẻ hơn. Hợp khi cần chấm điểm chính xác." },
      { id: "gpt-6-astra", name: "GPT-6 Astra", desc: "Mạnh nhất, dành cho suy luận phức tạp. Đắt nhất và chậm hơn." },
    ],
  },
};

export const modelOk = (provider: Provider, model: string) => /^[\w.:-]{2,80}$/.test(model) && !!PROVIDERS[provider];
