export type Provider = "gemini" | "openai";

export type ProviderInfo = {
  label: string;
  keyUrl: string;
  keySteps: string[];
  keyNote: string;
  models: string[]; // model đầu tiên là model dùng; các model sau là dự phòng khi hết lượt (askJson thử tối đa 4)
};

export const TEMPERATURE = 0.3; // cố định cho mọi giáo viên

// Model cố định, đi từ nhanh đến chậm. Ưu tiên tốc độ: hội thoại đơn giản, server đã tự kiểm đáp án.
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
    models: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"],
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
    models: ["gpt-6-luna", "gpt-6.1-terra", "gpt-6.1-sol", "gpt-6-astra"],
  },
};
