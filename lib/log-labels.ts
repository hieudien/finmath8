// Cách hiển thị từng hoạt động trong nhật ký (Cài đặt): tên, nhóm, mức quan trọng và câu mô tả viết từ meta.
export type Meta = Record<string, unknown>;
type Info = { label: string; group: string; warn?: boolean; text?: (m: Meta) => string };

const MODE: Record<string, string> = { chat: "Chat", steps: "Từng bước", quiz: "Trắc nghiệm" };
const PROVIDER: Record<string, string> = { gemini: "Google Gemini", openai: "OpenAI" };
const s = (v: unknown) => (v == null ? "" : String(v));

const ACC = "Tài khoản", PROB = "Đề và liên kết", STU = "Học sinh làm bài", SYS = "Hệ thống";

export const LOG: Record<string, Info> = {
  register: { label: "Đăng ký", group: ACC },
  email_confirmed: { label: "Xác nhận email", group: ACC },
  login: { label: "Đăng nhập", group: ACC },
  login_failed: { label: "Đăng nhập thất bại", group: ACC, warn: true, text: (m) => (m.reason === "unconfirmed" ? "Email chưa được xác nhận" : "Sai email hoặc mật khẩu") },
  logout: { label: "Đăng xuất", group: ACC },
  password_reset_requested: { label: "Yêu cầu đặt lại mật khẩu", group: ACC },
  password_reset: { label: "Đặt lại mật khẩu", group: ACC },
  settings_changed: { label: "Đổi cài đặt", group: ACC, text: (m) => [m.provider && `Nhà cung cấp ${PROVIDER[s(m.provider)] ?? s(m.provider)}`, m.mode && `kiểu ${MODE[s(m.mode)] ?? s(m.mode)}`, m.key_changed && "có đổi API key"].filter(Boolean).join(", ") },
  export: { label: "Tải dữ liệu", group: ACC, text: (m) => `Tải CSV${m.kind ? ` (${s(m.kind)})` : ""}${m.rows != null ? `, ${s(m.rows)} dòng` : ""}` },
  student_advice: { label: "AI đề xuất cải thiện cho học sinh", group: ACC, text: (m) => (m.code ? `Học sinh ${s(m.code)}` : "") },

  problem_created: { label: "Nạp đề", group: PROB, text: (m) => (m.code ? `Đề ${s(m.code)}` : "") },
  problem_updated: { label: "Sửa đề", group: PROB, text: (m) => (m.code ? `Đề ${s(m.code)}${m.version ? ` (bản ${s(m.version)})` : ""}` : "") },
  problem_deleted: { label: "Xóa đề", group: PROB },
  problem_normalized: { label: "Chuẩn hóa đề từ văn bản", group: PROB, text: (m) => (m.code ? `Đề ${s(m.code)}` : "") },
  problem_image_read: { label: "Đọc đề từ ảnh", group: PROB },
  problem_selftest: { label: "Kiểm thử chatbot", group: PROB, text: (m) => `Đề ${s(m.code)}: đạt ${s(m.passed)}/${s(m.total)} tình huống` },
  problems_seeded: { label: "Thêm đề mẫu", group: PROB, text: (m) => `${s(m.count)} đề` },
  link_created: { label: "Tạo liên kết", group: PROB, text: (m) => `${m.label ? `«${s(m.label)}»` : ""}${m.problems != null ? `, ${s(m.problems)} đề` : ""}`.replace(/^, /, "") },
  link_toggled: { label: "Bật/tắt liên kết", group: PROB, text: (m) => (m.active ? "Đã bật" : "Đã tắt") },
  link_deleted: { label: "Xóa liên kết", group: PROB },

  chat_session_started: { label: "Học sinh bắt đầu bài", group: STU, text: (m) => `Đề ${s(m.problem)}${m.mode ? `, kiểu ${MODE[s(m.mode)] ?? s(m.mode)}` : ""}` },
  chat_session_ended: { label: "Học sinh kết thúc bài", group: STU },
  survey_submitted: { label: "Học sinh tự đánh giá", group: STU, text: (m) => `Hiểu bài ${s(m.confidence)}/5, hài lòng ${s(m.likert)}/5` },
  session_analysis: { label: "AI phân tích một phiên", group: STU, text: (m) => (m.problem ? `Đề ${s(m.problem)}` : "") },
  eval_done: { label: "Chấm điểm xong", group: STU, text: (m) => `${s(m.total)}/12${Number(m.revealed) ? `, ${s(m.revealed)} bước được giải hộ` : ""}` },
  student_distress: { label: "Học sinh có dấu hiệu cần người lớn hỗ trợ", group: STU, warn: true },
  answer_leak_blocked: { label: "Chặn lộ đáp án", group: STU, warn: true, text: () => "Chatbot định nêu đáp án, hệ thống đã thay bằng câu hỏi tiếp" },
  session_capped: { label: "Chốt bài do quá số lượt", group: STU, warn: true, text: (m) => (m.done != null ? `Đã qua ${s(m.done)} bước` : "") },
  session_off_topic_closed: { label: "Chốt bài do lạc đề liên tục", group: STU, warn: true },

  model_fallback: { label: "Tự đổi model AI", group: SYS, text: (m) => `Từ ${s(m.from)} sang ${s(m.to)}${m.reason ? ` (${s(m.reason)})` : ""}` },
  error: { label: "Lỗi hệ thống", group: SYS, warn: true, text: (m) => `Mã lỗi ${s(m.ref)}: gửi mã này cho admin` },
};

export const GROUPS = [ACC, PROB, STU, SYS];
export const WARN = Object.keys(LOG).filter((k) => LOG[k].warn);
export const labelOf = (a: string) => LOG[a]?.label ?? a;
export const describe = (a: string, m: Meta) => { try { return LOG[a]?.text?.(m) ?? ""; } catch { return ""; } };
