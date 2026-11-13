// Cách hiển thị từng hoạt động trong nhật ký (Cài đặt): tên, nhóm, mức quan trọng và câu mô tả viết từ meta.
import { toTen } from "@/lib/score";
export type Meta = Record<string, unknown>;
type Info = { label: string; group: string; warn?: boolean; text?: (m: Meta) => string };

const MODE: Record<string, string> = { chat: "Chat", steps: "Từng bước", quiz: "Trắc nghiệm", worksheet: "Làm theo bước rồi nộp cả bài" };
const PROVIDER: Record<string, string> = { gemini: "Google Gemini" };
const s = (v: unknown) => (v == null ? "" : String(v));

const RULE: Record<string, string> = { anon: "Gửi quá nhanh (theo trình duyệt)", ip: "Cả mạng gửi quá nhiều", start_ip: "Mở quá nhiều bài cùng lúc", link_day: "Liên kết đạt trần lượt dùng trong ngày", anon_day: "Một em làm quá nhiều bài trong ngày", max_messages: "Đủ số tin tối đa của bài", too_fast: "Gửi tin liên tiếp dưới 2 giây" };

const ACC = "Tài khoản", PROB = "Đề và liên kết", STU = "Học sinh làm bài", SYS = "Hệ thống";

export const LOG: Record<string, Info> = {
  register: { label: "Đăng ký", group: ACC },
  email_confirmed: { label: "Xác nhận email", group: ACC },
  login: { label: "Đăng nhập", group: ACC },
  login_failed: { label: "Đăng nhập thất bại", group: ACC, warn: true, text: (m) => (m.reason === "unconfirmed" ? "Email chưa được xác nhận" : "Sai email hoặc mật khẩu") },
  logout: { label: "Đăng xuất", group: ACC },
  password_reset_requested: { label: "Yêu cầu đặt lại mật khẩu", group: ACC },
  password_reset: { label: "Đặt lại mật khẩu", group: ACC },
  settings_changed: { label: "Đổi cài đặt", group: ACC, text: (m) => { const c = (m.changed ?? {}) as Record<string, { from?: string; to?: string }>; const ch = (k: string, names: Record<string, string>) => `${names[s(c[k].from)] ?? (s(c[k].from) || "chưa đặt")} sang ${names[s(c[k].to)] ?? s(c[k].to)}`; return [m.provider && `Nhà cung cấp ${PROVIDER[s(m.provider)] ?? s(m.provider)}`, m.mode && `kiểu ${MODE[s(m.mode)] ?? s(m.mode)}${c.mode ? ` (${ch("mode", MODE)})` : ""}`, m.key_changed && "có đổi API key"].filter(Boolean).join(", "); } },
  export: { label: "Tải dữ liệu", group: ACC, text: (m) => `Tải CSV${m.kind ? ` (${s(m.kind)})` : ""}${m.rows != null ? `, ${s(m.rows)} dòng` : ""}` },
  student_deleted: { label: "Xóa học sinh", group: ACC, text: (m) => (m.code ? `${m.name ? `${s(m.name)} ` : ""}(${s(m.code)}), bài làm vẫn được giữ` : "") },
  student_advice: { label: "AI đề xuất cải thiện cho học sinh", group: ACC, text: (m) => (m.code ? `Học sinh ${s(m.code)}` : "") },

  problem_created: { label: "Nạp đề", group: PROB, text: (m) => (m.code ? `Đề ${s(m.code)}` : "") },
  problem_updated: { label: "Sửa đề", group: PROB, text: (m) => (m.code ? `Đề ${s(m.code)}${m.version ? ` (bản ${s(m.version)})` : ""}` : "") + (m.answer ? ` · ${({ set: "nhập và khóa đáp án", lock: "khóa đáp án", unlock: "mở khóa đáp án" } as Record<string, string>)[s(m.answer)] ?? ""}` : "") },
  problem_deleted: { label: "Xóa đề", group: PROB },
  problem_standardized: { label: "Chuẩn hóa đề", group: PROB, text: (m) => (m.code ? `Đề ${s(m.code)}${m.version ? ` (bản ${s(m.version)})` : ""}` : "") },
  problem_normalized: { label: "Đọc đề từ văn bản", group: PROB, text: (m) => (m.code ? `Đề ${s(m.code)}` : "") },
  problem_image_read: { label: "Đọc đề từ ảnh", group: PROB },
  import_read: { label: "Đọc nguồn nạp đề hàng loạt", group: PROB, text: (m) => `${s(m.items)} đề${m.attempts ? `, đọc ${s(m.attempts)} lần` : ""}` },
  import_batch_created: { label: "Bắt đầu nạp đề hàng loạt", group: PROB, text: (m) => `${s(m.file)}: ${s(m.found)} đề` },
  import_batch_confirmed: { label: "Xác nhận nạp đề hàng loạt", group: PROB, text: (m) => `Lưu ${s(m.saved)} đề, ${s(m.failed)} đề lỗi bỏ qua` },
  import_batch_cancelled: { label: "Hủy nạp đề hàng loạt", group: PROB },
  problem_selftest: { label: "Kiểm thử chatbot", group: PROB, text: (m) => `Đề ${s(m.code)}: đạt ${s(m.passed)}/${s(m.total)} tình huống` },
  problems_seeded: { label: "Thêm đề mẫu", group: PROB, text: (m) => `${s(m.count)} đề` },
  link_created: { label: "Tạo liên kết", group: PROB, text: (m) => `${m.label ? `«${s(m.label)}»` : ""}${m.problems != null ? `, ${s(m.problems)} đề` : ""}`.replace(/^, /, "") },
  link_toggled: { label: "Bật/tắt liên kết", group: PROB, text: (m) => (m.active ? "Đã bật" : "Đã tắt") },
  link_deleted: { label: "Xóa liên kết", group: PROB },

  chat_session_started: { label: "Học sinh bắt đầu bài", group: STU, text: (m) => `Đề ${s(m.problem)}${m.mode ? `, kiểu ${MODE[s(m.mode)] ?? s(m.mode)}` : ""}` },
  chat_session_ended: { label: "Học sinh kết thúc bài", group: STU },
  survey_submitted: { label: "Học sinh tự đánh giá", group: STU, text: (m) => `Hiểu bài ${s(m.confidence)}/5, hài lòng ${s(m.likert)}/5` },
  session_analysis: { label: "AI phân tích một phiên", group: STU, text: (m) => (m.problem ? `Đề ${s(m.problem)}` : "") },
  eval_done: { label: "Chấm điểm xong", group: STU, text: (m) => `${toTen(Number(m.total))}/10${Number(m.revealed) ? `, ${s(m.revealed)} bước được giải hộ` : ""}` },
  student_distress: { label: "Học sinh có dấu hiệu cần người lớn hỗ trợ", group: STU, warn: true },
  answer_leak_blocked: { label: "Chặn lộ đáp án", group: STU, warn: true, text: () => "Chatbot định nêu đáp án, hệ thống đã thay bằng câu hỏi tiếp" },
  session_capped: { label: "Chốt bài do quá số lượt", group: STU, warn: true, text: (m) => (m.done != null ? `Đã qua ${s(m.done)} bước` : "") },
  rate_limited: { label: "Học sinh bị chặn do gửi quá nhiều", group: STU, warn: true, text: (m) => RULE[s(m.rule)] ?? s(m.rule) },
  link_closed: { label: "Học sinh vào liên kết đã đóng", group: STU, text: (m) => (m.reason === "expired" ? "Liên kết đã hết hạn" : "Liên kết đang tắt") },
  session_off_topic_closed: { label: "Chốt bài do lạc đề liên tục", group: STU, warn: true },
  ws_hint: { label: "Học sinh mở gợi ý", group: STU, text: (m) => `Bước ${s(m.step)}, gợi ý ${s(m.level)}` },
  ws_reveal: { label: "Học sinh xem đáp án một bước", group: STU, warn: true, text: (m) => `Bước ${s(m.step)} (không tính điểm)` },
  ws_submit: { label: "Học sinh nộp bài", group: STU, text: (m) => `Lần ${s(m.attempt)}: đúng ${s(m.right)}/${s(m.total)} bước` },
  ws_ask: { label: "Học sinh hỏi về một bước", group: STU, text: (m) => `Bước ${s(m.step)}` },

  model_fallback: { label: "Tự đổi model AI", group: SYS, text: (m) => `Từ ${s(m.from)} sang ${s(m.to)}${m.reason ? ` (${s(m.reason)})` : ""}` },
  error: { label: "Lỗi hệ thống", group: SYS, warn: true, text: (m) => `Mã lỗi ${s(m.ref)}: gửi mã này cho admin` },
};

export const GROUPS = [ACC, PROB, STU, SYS];

// Loại lỗi của nhật ký lỗi (cột error_logs.kind): nhãn tiếng Việt và gợi ý việc cần làm.
export const ERR_KIND: Record<string, { label: string; hint: string }> = {
  quota: { label: "Hết hạn mức AI", hint: "Kiểm tra gói hoặc thanh toán của API key, hoặc chờ sang ngày mới." },
  timeout: { label: "AI trả lời quá chậm", hint: "Thử lại sau; nếu lặp lại, đổi nhà cung cấp." },
  key: { label: "API key bị từ chối", hint: "Nhập key mới ở mục API key phía trên." },
  model: { label: "Model AI không còn dùng được", hint: "Báo admin cập nhật danh sách model." },
  overload: { label: "AI quá tải hoặc mất kết nối", hint: "Thường tự hết sau vài phút." },
  format: { label: "AI trả sai định dạng", hint: "Thử lại; nếu lặp lại, báo admin." },
  db: { label: "Lỗi cơ sở dữ liệu", hint: "Báo admin kèm mã lỗi." },
  mail: { label: "Không gửi được email", hint: "Kiểm tra cấu hình gửi thư, thử lại sau ít phút." },
  config: { label: "Chưa cấu hình xong", hint: "Chatbot chưa có API key nên học sinh không làm bài được." },
  render: { label: "Lỗi hiển thị trang", hint: "Báo admin kèm mã lỗi." },
  client: { label: "Lỗi trên trình duyệt", hint: "Báo admin kèm mã lỗi." },
  watchdog: { label: "Yêu cầu chạy quá lâu", hint: "Yêu cầu chưa xong sau 55 giây nên có thể đã bị cắt. Thử lại; nếu lặp lại, chia nhỏ việc hoặc đổi model." },
  process: { label: "Lỗi tiến trình máy chủ", hint: "Báo admin kèm mã lỗi." },
  other: { label: "Lỗi khác", hint: "Báo admin kèm mã lỗi." },
};
export const WARN = Object.keys(LOG).filter((k) => LOG[k].warn);
export const labelOf = (a: string) => LOG[a]?.label ?? a;
export const describe = (a: string, m: Meta) => { try { return LOG[a]?.text?.(m) ?? ""; } catch { return ""; } };
