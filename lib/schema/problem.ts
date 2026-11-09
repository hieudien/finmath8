import { z } from "zod";

export const problemSchema = z.object({
  id: z.string().min(1, "Thiếu id (vd TC01)"),
  title: z.string().min(1, "Thiếu title"),
  grade: z.number().int().min(1).max(12).default(8),
  topic: z.string().default(""),
  skills: z.array(z.string()).default([]), // kỹ năng/kiến thức chính của đề, để gom điểm yếu của học sinh theo kỹ năng
  reviewed: z.boolean().default(true), // false: AI vừa tạo, giáo viên chưa duyệt; đề chưa duyệt không đưa vào liên kết
  statement: z.string().optional(),
  learning_objectives: z.array(z.string()).default([]),
  data: z.record(z.string(), z.unknown()).default({}),
  solution: z.record(z.string(), z.unknown()),
  solution_steps: z.array(z.string()).default([]), // lời giải từng bước bằng văn bản, để giáo viên xem
  step_goals: z.array(z.string()).default([]), // việc cần làm ở từng bước (học sinh thấy), AI viết sẵn, song song solution_steps; lệch số bước thì không dùng
  step_hints: z.array(z.array(z.string()).max(3)).default([]), // gợi ý riêng từng bước (mức 1-3), song song solution_steps; lệch số bước thì không dùng
  step_choices: z.array(z.object({ right: z.string(), traps: z.array(z.object({ text: z.string(), why: z.string() })).length(3) })).default([]), // trắc nghiệm từng bước (1 đúng + 3 bẫy kèm lời giải thích lỗi), song song solution_steps; lệch số bước thì không dùng
  common_errors: z.array(z.string()).default([]),
  hints: z.array(z.object({ level: z.number().int().min(1).max(3), text: z.string() })).min(3, "Cần đủ 3 mức gợi ý"),
  extension: z.string().default(""),
  greeting: z.string().default(""), // lời chào đầu tiên AI tạo sẵn khi nạp đề, rỗng thì dùng câu dự phòng
  rubric: z
    .object({ identify: z.number(), plan: z.number(), calculate: z.number(), explain: z.number() })
    .default({ identify: 3, plan: 3, calculate: 3, explain: 3 }),
});
export type Problem = z.infer<typeof problemSchema>;

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
