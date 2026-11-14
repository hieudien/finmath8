import { z } from "zod";

export const problemSchema = z.object({
  id: z.string().min(1, "Thiếu id (vd TC01)"),
  title: z.string().min(1, "Thiếu title"),
  grade: z.number().int().min(1).max(12).default(8),
  topic: z.string().default(""),
  branch: z.enum(["algebra", "geometry", "other"]).optional().catch(undefined), // nhánh Đại số/Hình học/Khác; thiếu hoặc AI trả sai = chưa phân loại
  skills: z.array(z.string()).default([]), // kỹ năng/kiến thức chính của đề, để gom điểm yếu của học sinh theo kỹ năng
  reviewed: z.boolean().default(true), // false: AI vừa tạo, giáo viên chưa duyệt; đề chưa duyệt không đưa vào liên kết
  answer_locked: z.boolean().default(false), // giáo viên đã tự kiểm và xác nhận đáp án đúng: chuẩn hóa không bao giờ đổi, đề mới đưa vào liên kết được
  statement: z.string().trim().min(1, "Thiếu statement (đề bài)"), // nguồn duy nhất để AI tạo data, đáp án, lời giải
  figure: z.object({ path: z.string().min(1), desc: z.string().default("") }).optional().catch(undefined), // hình vẽ của đề (ảnh đã cắt ở bucket "figures") + mô tả bằng chữ cho AI; thiếu hoặc sai dạng = đề không có hình
  data: z.record(z.string(), z.unknown()).default({}),
  solution: z.record(z.string(), z.unknown()),
  solution_steps: z.array(z.string()).default([]), // lời giải từng bước bằng văn bản, để giáo viên xem
  check_note: z.string().default(""), // cảnh báo khi kiểm chéo đáp án lệch, giáo viên xem lúc duyệt; rỗng = không có
  common_errors: z.array(z.string()).default([]),
  hints: z.array(z.object({ level: z.number().int().min(1).max(3), text: z.string() })).min(3, "Cần đủ 3 mức gợi ý"),
});
export type Problem = z.infer<typeof problemSchema>;
// Đề do giáo viên đưa vào (nạp JSON, đề mẫu có sẵn) mà đã có đáp án: coi như đáp án giáo viên cung cấp, khóa luôn.
export const lockIfAnswered = (p: Problem): Problem => (Object.keys(p.solution).length ? { ...p, answer_locked: true } : p);

export function parseProblems(raw: unknown): { ok: Problem[]; errors: string[] } {
  const list = Array.isArray(raw) ? raw : [raw];
  const ok: Problem[] = [];
  const errors: string[] = [];
  list.forEach((item, i) => {
    const r = problemSchema.safeParse(item);
    if (r.success) ok.push(r.data);
    else errors.push(`Đề ${i + 1}: ` + r.error.issues.map((x) => `${x.path.join(".") || "(gốc)"}: ${x.message}`).join("; "));
  });
  return { ok, errors };
}
