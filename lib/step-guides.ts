import { z } from "zod";
import { askJson, type LlmCfg } from "@/lib/llm";
import { leaks } from "@/lib/chat/prompt";
import { reportError } from "@/lib/errors";
import type { Problem } from "@/lib/schema/problem";

const SYSTEM = `Viết CHỈ DẪN cho từng bước của lời giải một bài Toán, cho học sinh đang làm bước đó. Mỗi bước gồm:
- goal: MỘT câu ngắn nêu VIỆC học sinh cần làm ở bước đó (động từ + đại lượng cần tìm, ví dụ "Tìm số tiền Nam còn thiếu", "Gọi ẩn và viết phương trình"). KHÔNG nêu kết quả hay phép tính ra kết quả.
- hints: 3 mức, mỗi mức 1 câu: mức 1 = định hướng nhẹ (nhìn vào đâu); mức 2 = chỉ cách làm (dùng công thức hay phép tính nào); mức 3 = nêu tên phép tính hoặc quy tắc cần dùng nhưng KHÔNG viết sẵn biểu thức đã thay số của bước và KHÔNG nêu kết quả (học sinh phải tự viết phép tính).
Tuyệt đối không nêu kết quả của chính bước đó trong goal và hints. Xưng "mình", gọi học sinh là "bạn". Công thức đặt trong $...$ theo LaTeX.
Chỉ trả JSON {"steps": [{"goal": string, "hints": [mức1, mức2, mức3]}]} đúng một phần tử cho mỗi bước, theo thứ tự các bước.`;

const out = z.object({
  steps: z.array(z.object({
    goal: z.string().min(3),
    hints: z.array(z.string().min(3)).min(1).max(3),
  })),
});

// AI viết một lần lúc giáo viên bấm nút; lúc học sinh dùng thì không tốn lượt AI. Số phần tử phải khớp số bước, không khớp thì bỏ (trả null).
// Mục tiêu lộ đáp án (số kết quả) thì để trống: học sinh thấy ngay câu này. Gợi ý lộ thì runtime (stepHint) vẫn chặn.
export async function makeStepGuides(cfg: LlmCfg, p: Problem, steps = p.solution_steps): Promise<{ goals: string[]; hints: string[][] } | null> {
  if (!steps.length) return null;
  const errs = p.common_errors.length ? `\nSai lầm thường gặp:\n${p.common_errors.map((e) => `- ${e}`).join("\n")}` : "";
  const text = `Có ĐÚNG ${steps.length} bước, trả đúng ${steps.length} phần tử trong "steps", mỗi bước một phần tử, không gộp, không bỏ bước.
${p.statement ?? p.title}\nDữ liệu: ${JSON.stringify(p.data)}\nCác bước lời giải:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}${errs}`;
  for (let t = 0; t < 3; t++) {
    const x = await askJson(cfg, SYSTEM, [{ role: "user", text }], out, { maxTokens: 3000, use: "step_guides" }).catch(async (e) => { await reportError(e, `tạo chỉ dẫn từng bước, đề ${p.id}`, { teacherId: cfg.teacherId, actor: "teacher" }); return null; });
    if (x && x.steps.length !== steps.length) await reportError(new Error(`AI trả sai số bước: ${x.steps.length}/${steps.length}, đề ${p.id}`), "tạo chỉ dẫn từng bước", { teacherId: cfg.teacherId, actor: "teacher", kind: "format" });
    if (x?.steps.length === steps.length) return { goals: x.steps.map((s) => (leaks(s.goal, p.solution, [p.data, p.statement], steps) ? "" : s.goal.trim())), hints: x.steps.map((s) => s.hints) };
  }
  return null;
}
