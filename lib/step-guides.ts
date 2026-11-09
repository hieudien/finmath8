import { z } from "zod";
import { askJson, type LlmCfg } from "@/lib/llm";
import { leaks } from "@/lib/chat/prompt";
import { checkpoints, hasNum, norm, type Cp } from "@/lib/chat/progress";
import type { Problem } from "@/lib/schema/problem";

const SYSTEM = `Viết CHỈ DẪN và TRẮC NGHIỆM cho từng bước của lời giải một bài Toán, cho học sinh đang làm bước đó. Mỗi bước gồm:
- goal: MỘT câu ngắn nêu VIỆC học sinh cần làm ở bước đó (động từ + đại lượng cần tìm, ví dụ "Tìm số tiền Nam còn thiếu", "Gọi ẩn và viết phương trình"). KHÔNG nêu kết quả hay phép tính ra kết quả.
- hints: 3 mức, mỗi mức 1 câu: mức 1 = định hướng nhẹ (nhìn vào đâu); mức 2 = chỉ cách làm (dùng công thức hay phép tính nào); mức 3 = nêu tên phép tính hoặc quy tắc cần dùng nhưng KHÔNG viết sẵn biểu thức đã thay số của bước và KHÔNG nêu kết quả (học sinh phải tự viết phép tính).
- choice: câu trả lời cho việc ở goal, gồm right và 3 traps. right = kết quả ĐÚNG của bước theo lời giải (ngắn, ví dụ "x = 4" hoặc "120 000 đồng"). traps = 3 kết quả SAI nhưng trông hợp lý, mỗi cái do MỘT lỗi hay gặp (quên đổi dấu khi chuyển vế, nhầm công thức, chia sai, bỏ sót một số hạng, nhầm đơn vị...). Bẫy cùng dạng và độ dài với right, khác right và khác nhau. Mỗi bẫy kèm why: một câu ngắn nói lỗi đó là gì và cách tránh, KHÔNG nêu kết quả đúng. Học sinh phải tự tính mới biết đáp án nào đúng, nên bẫy không được lộ liễu sai. Ưu tiên lấy lỗi từ mục "Sai lầm thường gặp" nếu có.
Tuyệt đối không nêu kết quả của chính bước đó trong goal, hints và why. Xưng "mình", gọi học sinh là "bạn". Công thức đặt trong $...$ theo LaTeX.
Chỉ trả JSON {"steps": [{"goal": string, "hints": [mức1, mức2, mức3], "choice": {"right": string, "traps": [{"text": string, "why": string}]}}]} đúng một phần tử cho mỗi bước, theo thứ tự các bước.`;

const out = z.object({
  steps: z.array(z.object({
    goal: z.string().min(3),
    hints: z.array(z.string().min(3)).min(1).max(3),
    choice: z.object({ right: z.string().min(1), traps: z.array(z.object({ text: z.string().min(1), why: z.string().min(3) })).length(3) }),
  })),
});

const key = (s: string) => s.replace(/\s+/g, "").toLowerCase();

// Trắc nghiệm một bước hợp lệ: 4 đáp án khác nhau sau khi chuẩn hóa (bỏ khoảng trắng, hoa thường).
// Đáp án đúng có chữ số thì phải chứa ít nhất một số của bước đó (AI không bịa kết quả lạc bước). Không đòi đủ mọi số: bước kết luận hay bước so sánh chỉ nêu một phần.
// ponytail: chỉ so chuỗi, không hiểu "x = 4" và "4 = x" là một. Nâng cấp: parser biểu thức.
export function validChoice(c: Problem["step_choices"][number], cp: Cp): boolean {
  if (new Set([c.right, ...c.traps.map((t) => t.text)].map(key)).size !== 4) return false;
  return !/\d/.test(norm(c.right)) || !cp.anchors.length || cp.anchors.some((n) => hasNum(c.right, n));
}

// AI viết một lần lúc giáo viên bấm nút; lúc học sinh dùng thì không tốn lượt AI. Số phần tử phải khớp số bước, không khớp thì bỏ (trả null).
// Mục tiêu lộ đáp án (số kết quả) thì để trống: học sinh thấy ngay câu này. Gợi ý lộ thì runtime (stepHint) vẫn chặn.
// choices rỗng nếu có bước nào trắc nghiệm không hợp lệ sau 3 lần thử (đề chạy kiểu Từng bước thay vì Trắc nghiệm).
export async function makeStepGuides(cfg: LlmCfg, p: Problem, steps = p.solution_steps): Promise<{ goals: string[]; hints: string[][]; choices: Problem["step_choices"] } | null> {
  if (!steps.length) return null;
  const cps = checkpoints({ ...p, solution_steps: steps });
  const errs = p.common_errors.length ? `\nSai lầm thường gặp:\n${p.common_errors.map((e) => `- ${e}`).join("\n")}` : "";
  const text = `Có ĐÚNG ${steps.length} bước, trả đúng ${steps.length} phần tử trong "steps", mỗi bước một phần tử, không gộp, không bỏ bước.
${p.statement ?? p.title}\nDữ liệu: ${JSON.stringify(p.data)}\nCác bước lời giải:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}${errs}`;
  let r: z.infer<typeof out> | null = null;
  for (let t = 0; t < 3; t++) {
    const x = await askJson(cfg, SYSTEM, [{ role: "user", text }], out, { maxTokens: 4000 }).catch((e) => { console.error("makeStepGuides:", p.id, String(e).slice(0, 300)); return null; });
    if (x && x.steps.length !== steps.length) console.error("makeStepGuides: sai số bước", p.id, x.steps.length, "/", steps.length);
    if (!x || x.steps.length !== steps.length) continue;
    r = x;
    const bad = x.steps.flatMap((s, i) => (validChoice(s.choice, cps[i]) ? [] : [{ i, must: cps[i].must, c: s.choice }]));
    if (!bad.length) break;
    console.error("makeStepGuides: trắc nghiệm không hợp lệ", p.id, JSON.stringify(bad).slice(0, 600));
  }
  if (!r) return null;
  const choices = r.steps.map((s) => s.choice);
  return {
    goals: r.steps.map((s) => (leaks(s.goal, p.solution, [p.data, p.statement], steps) ? "" : s.goal.trim())),
    hints: r.steps.map((s) => s.hints),
    choices: choices.every((c, i) => validChoice(c, cps[i])) ? choices : [],
  };
}
