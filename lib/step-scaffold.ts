import { z } from "zod";
import { askJson, type LlmCfg } from "@/lib/llm";
import { leaks } from "@/lib/chat/prompt";
import { hasNum, numsIn } from "@/lib/chat/progress";
import { gradeRule } from "@/lib/grade";
import { reportError } from "@/lib/errors";
import { walk } from "@/lib/latex-fix";
import { newNumbers } from "@/lib/step-guides";
import type { Problem } from "@/lib/schema/problem";

// Giàn đỡ cho học sinh kẹt: mỗi bước có (1) các câu hỏi con chia nhỏ vấn đề, (2) một ví dụ tương tự với số khác hẳn.
// AI viết một lần lúc chuẩn hóa đề; lúc học sinh dùng thì không tốn lượt AI. Lộ kết quả thì bỏ phần đó (rỗng).
const SYSTEM = `Với từng bước của lời giải một bài Toán, viết giàn đỡ cho học sinh đang KẸT ở bước đó. Mỗi bước gồm:
- subs: 2 đến 3 CÂU HỎI CON, chia nhỏ bước thành các việc nhỏ làm lần lượt (ví dụ "Đề cho biết những số nào?", "Bạn cần tìm đại lượng nào?", "Hai đại lượng đó liên hệ với nhau bằng phép tính nào?"). Mỗi câu hỏi chỉ rõ MỘT việc cụ thể của bước này, dẫn học sinh tới tự viết được bước. KHÔNG nêu kết quả, KHÔNG viết sẵn phép tính đã thay số của bước, KHÔNG chép lại câu của lời giải.
- analog: MỘT ví dụ tương tự: một bài nhỏ CÙNG DẠNG với bước này nhưng tình huống khác và SỐ KHÁC HẲN (tuyệt đối không dùng số nào của đề và của lời giải), giải ra 2 đến 3 dòng ngắn rồi nói "Bạn làm tương tự với số của đề nhé." Ví dụ này được phép có kết quả riêng của nó. Không có ví dụ phù hợp thì "".
Xưng "mình", gọi học sinh là "bạn". Công thức đặt trong $...$ theo LaTeX. Tiếng Việt có dấu đầy đủ.
Chỉ trả JSON {"steps": [{"subs": [string], "analog": string}]} đúng một phần tử cho mỗi bước, theo thứ tự các bước.`;

const out = z.object({ steps: z.array(z.object({ subs: z.array(z.string().min(3)).max(4).default([]), analog: z.string().default("") })) });

// Số của đề (từ 2 chữ số trở lên hoặc có phần thập phân) không được xuất hiện trong ví dụ tương tự: tránh ví dụ giải hộ bài thật.
const usesProblemNumbers = (analog: string, p: Problem, steps: string[], i: number) => {
  const given: string[] = numsIn(`${p.statement} ${JSON.stringify(p.data)} ${JSON.stringify(p.solution)}`).filter((n) => n.length >= 2 || n.includes("."));
  return [...given, ...newNumbers(steps, i, p)].some((n) => hasNum(analog, n));
};

// Trả null nếu AI hỏng hoặc lệch số bước. Phần lộ kết quả bị thay bằng rỗng (subs: [], analog: "").
export async function makeStepScaffold(cfg: LlmCfg, p: Problem, steps = p.solution_steps): Promise<{ subs: string[][]; analogs: string[] } | null> {
  if (!steps.length) return null;
  const text = `Có ĐÚNG ${steps.length} bước, trả đúng ${steps.length} phần tử.\n${p.statement}\nDữ liệu: ${JSON.stringify(p.data)}\nCác bước lời giải:\n${steps.map((s, i) => { const ban = newNumbers(steps, i, p); const goal = p.step_goals.length === steps.length ? p.step_goals[i] : ""; return `${i + 1}. ${s}${goal ? `\n   Việc cần làm (học sinh đã thấy): ${goal}` : ""}${ban.length ? `\n   KHÔNG được nhắc: ${ban.join(", ")}` : ""}`; }).join("\n")}`;
  const raw = await askJson(cfg, SYSTEM + gradeRule(p.grade), [{ role: "user", text }], out, { maxTokens: 4000, use: "step_scaffold" }).catch(async (e) => { await reportError(e, `tạo giàn đỡ từng bước, đề ${p.id}`, { teacherId: cfg.teacherId, actor: "teacher" }); return null; });
  const x = raw && (walk(raw) as typeof raw);
  if (!x || x.steps.length !== steps.length) return null;
  const given = [p.data, p.statement];
  return {
    subs: x.steps.map((s) => (s.subs.some((q) => leaks(q, p.solution, given, steps)) ? [] : s.subs.map((q) => q.trim()).filter(Boolean))),
    analogs: x.steps.map((s, i) => (s.analog && !leaks(s.analog, p.solution, given, steps) && !usesProblemNumbers(s.analog, p, steps, i) ? s.analog.trim() : "")),
  };
}
