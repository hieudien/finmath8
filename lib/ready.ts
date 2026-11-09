import { hasGuides } from "@/lib/chat/goals";
import { problemSchema } from "@/lib/schema/problem";

// Thông tin còn thiếu để đề chạy được cả kiểu chat lẫn từng bước. Mảng rỗng = đủ, tạo được liên kết.
export function missingInfo(content: unknown): string[] {
  const r = problemSchema.safeParse(content);
  if (!r.success) return ["đề lưu sai định dạng"];
  const p = r.data, out: string[] = [];
  if (!Object.keys(p.solution).length) out.push("đáp án");
  if (!p.solution_steps.length) out.push("lời giải từng bước");
  if (!hasGuides(p)) out.push("chỉ dẫn và gợi ý từng bước");
  return out;
}
