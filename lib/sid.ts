// Mã phiên ngắn (8 ký tự đầu UUID) để học sinh/giáo viên đọc hoặc gõ lại khi báo lỗi. Tra lại bằng tiền tố của chat_sessions.id.
export const shortId = (id: string) => id.slice(0, 8);
