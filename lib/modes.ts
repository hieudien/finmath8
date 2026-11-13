// Chế độ làm bài của học sinh, giáo viên chọn ở Cài đặt (cột teacher_settings.interaction_mode, ghim vào chat_sessions.mode lúc mở phiên).
// steps: chat từng bước (hệ thống hỏi, học sinh trả lời, có nhận xét từng lượt). worksheet: đọc đề, xem hướng dẫn từng bước, nhập đáp án mọi bước rồi nộp cả bài một lần.
export const MODES = {
  steps: { label: "Chat từng bước", hint: "Học sinh nộp từng bước, chatbot nhận xét ngay sau mỗi bước." },
  worksheet: { label: "Làm theo bước rồi nộp cả bài", hint: "Học sinh thấy hết các bước dạng thu gọn, tự giải ra giấy nháp, chép vào từng ô (hoặc chọn viết cả lời giải vào một ô) rồi nộp một lần. AI chấm từng bước, bước sai thì sửa và nộp lại." },
} as const;
export type WorkMode = keyof typeof MODES;
export const isMode = (m: unknown): m is WorkMode => typeof m === "string" && m in MODES;
