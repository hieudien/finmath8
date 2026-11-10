import { hasGuides } from "@/lib/chat/goals";
import { lintProblem } from "@/lib/lint";
import { problemSchema } from "@/lib/schema/problem";

// Thông tin còn thiếu để đề chạy được kiểu từng bước. Mảng rỗng = đủ, tạo được liên kết.
export function missingInfo(content: unknown): string[] {
  const r = problemSchema.safeParse(content);
  if (!r.success) return ["đề lưu sai định dạng"];
  const p = r.data, out: string[] = [];
  if (!Object.keys(p.solution).length) out.push("đáp án");
  if (!p.solution_steps.length) out.push("lời giải từng bước");
  if (!hasGuides(p)) out.push("chỉ dẫn và gợi ý từng bước");
  return out;
}

// Trạng thái một đề để thống kê ở trang Đề bài. ok = không còn gì cần xử lý: đủ thông tin, chỉ dẫn và kết quả chuẩn khớp số bước, đã duyệt, không có cảnh báo.
export function readiness(content: unknown) {
  const r = problemSchema.safeParse(content);
  if (!r.success) return { bad: true, ok: false, needGuides: false, pending: false, unconfirmed: false, lint: [] as string[] };
  const p = r.data;
  const needGuides = p.solution_steps.length > 0 && (!hasGuides(p) || p.step_checks.length !== p.solution_steps.length), pending = !p.reviewed;
  const lint = [...(p.check_note ? [p.check_note] : []), ...lintProblem(p)];
  // unconfirmed: giáo viên chưa xác nhận đáp án. Không tính vào ok/needsWork vì chuẩn hóa bằng AI không thể thay giáo viên xác nhận.
  return { bad: false, ok: !missingInfo(content).length && !needGuides && !pending && !lint.length, needGuides, pending, unconfirmed: !p.answer_locked, lint };
}

// Đề còn việc cho AI làm (nút "Chuẩn hóa" hàng loạt). Đề sai định dạng thì AI không sửa được nên không tính.
export const needsWork = (content: unknown) => { const r = readiness(content); return !r.bad && !r.ok; };

// Lý do một đề không xác nhận đáp án được (rỗng = xác nhận được). Dùng chung cho giao diện và server.
export function cannotLock(content: unknown): string {
  const r = problemSchema.safeParse(content);
  if (!r.success) return "Đề lưu sai định dạng.";
  if (r.data.answer_locked) return "Đã khóa.";
  return Object.keys(r.data.solution).length ? "" : "Chưa có đáp án.";
}
