// Chế độ làm bài của học sinh. Mỗi liên kết cố định một chế độ (cột public_links.mode, chọn lúc tạo). Cài đặt (teacher_settings.interaction_mode) chỉ là mặc định cho liên kết mới. chat_sessions.mode ghi lại chế độ lúc mở phiên.
// steps: chat từng bước (hệ thống hỏi, học sinh trả lời, có nhận xét từng lượt). worksheet: đọc đề, xem hướng dẫn từng bước, nhập đáp án mọi bước rồi nộp cả bài một lần.
export const MODES = {
  steps: { label: "Chat từng bước", hint: "Học sinh nộp từng bước, chatbot nhận xét ngay sau mỗi bước." },
  worksheet: { label: "Làm theo bước rồi nộp cả bài", hint: "Học sinh thấy hết các bước dạng thu gọn, tự giải ra giấy nháp, chép vào từng ô (hoặc chọn viết cả lời giải vào một ô) rồi nộp một lần. AI chấm từng bước, bước sai thì sửa và nộp lại." },
} as const;
export type WorkMode = keyof typeof MODES;
export const isMode = (m: unknown): m is WorkMode => typeof m === "string" && m in MODES;
// Liên kết dùng kiểu khác với luồng đang gọi (vd học sinh giữ trang cũ mở sau khi mở link khác kiểu) thì API từ chối.
export const modeMismatch = (link: { mode: WorkMode }, expected: WorkMode) => link.mode !== expected;
