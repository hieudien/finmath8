export type Provider = "gemini";

export type ProviderInfo = {
  label: string;
  keyUrl: string;
  keySteps: string[];
  keyNote: string;
  models: string[]; // model đầu tiên là model dùng; các model sau là dự phòng khi hết lượt (askJson thử tối đa 4)
};

export const TEMPERATURE = 0.3; // cố định cho mọi giáo viên

// Model cho việc chạy một lần mỗi đề (kiểm chéo đáp án). Đo bằng npm run eval (3 đề, nạp lại đáp án + chỉ dẫn từ đề trống):
// model đầu đạt 2/3 đáp án, 3/3 chỉ dẫn, ~2,5 giây/lượt; models[2] đạt 1/3, ~4 giây; models[3] đạt 0/3, ~113 giây. Model mạnh hơn chưa tốt hơn nên dùng models[0].
// Đổi chỉ số khi đo lại thấy khác.
export const SMART_INDEX = 0;
export const smartModel = (p: Provider) => PROVIDERS[p].models[SMART_INDEX] ?? PROVIDERS[p].models[0];

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
};
