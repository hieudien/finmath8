import { z } from "zod";
import { askJson, type LlmCfg } from "@/lib/llm";
import { leaks } from "@/lib/chat/prompt";
import { numsIn, stripStep } from "@/lib/chat/progress";
import { canon } from "@/lib/answer-check";
import { gradeRule } from "@/lib/grade";
import { reportError } from "@/lib/errors";
import { walk } from "@/lib/latex-fix";
import type { Problem } from "@/lib/schema/problem";

const SYSTEM = `Viết CHỈ DẪN cho từng bước của lời giải một bài Toán, cho học sinh đang làm bước đó. Mỗi bước gồm:
- goal: MỘT câu ngắn nêu VIỆC học sinh cần làm ở bước đó (động từ + đại lượng cần tìm, ví dụ "Tìm số tiền Nam còn thiếu", "Gọi ẩn và viết phương trình"). KHÔNG nêu kết quả hay phép tính ra kết quả.
- hints: 3 mức, mỗi mức 1 câu: mức 1 = định hướng nhẹ (nhìn vào đâu); mức 2 = chỉ cách làm (dùng công thức hay phép tính nào); mức 3 = nêu tên phép tính hoặc quy tắc cần dùng nhưng KHÔNG viết sẵn biểu thức đã thay số của bước và KHÔNG nêu kết quả (học sinh phải tự viết phép tính).
- result: KẾT QUẢ CHUẨN của bước, chép đúng từ lời giải của bước đó. Số thì viết số thuần, không dấu ngăn nghìn, thập phân dùng dấu chấm (ví dụ "45000", "0.15"); biểu thức hoặc chữ thì viết ngắn gọn ("x=2", "vô nghiệm"). Bước chỉ nêu cách làm, không có kết quả cụ thể: "".
- accepts: tối đa 3 cách viết khác CÙNG giá trị với result mà học sinh có thể viết (ví dụ "15" khi result là "0.15"; "x = 2" khi result "x=2"). Thường để [].
- traps: 0 đến 2 sai lầm CỤ THỂ học sinh hay mắc ở bước này (dựa vào "Sai lầm thường gặp" nếu có): wrong = kết quả SAI mà học sinh sẽ nêu (số thuần hoặc biểu thức ngắn, KHÁC result); why = MỘT câu nói lỗi nằm ở đâu và bảo kiểm lại, KHÔNG nêu kết quả đúng.
Tuyệt đối không nêu kết quả của chính bước đó trong goal, hints và why. Xưng "mình", gọi học sinh là "bạn". Công thức đặt trong $...$ theo LaTeX. Trong JSON, mỗi dấu \\ của LaTeX phải viết gấp đôi (\\\\frac, \\\\times, \\\\begin), nếu không sẽ thành ký tự điều khiển.
Chỉ trả JSON {"steps": [{"goal": string, "hints": [mức1, mức2, mức3], "result": string, "accepts": [string], "traps": [{"wrong": string, "why": string}]}]} đúng một phần tử cho mỗi bước, theo thứ tự các bước.`;

const out = z.object({
  steps: z.array(z.object({
    goal: z.string().min(3),
    hints: z.array(z.string().min(3)).min(1).max(3),
    result: z.string().default(""),
    accepts: z.array(z.string()).default([]),
    traps: z.array(z.object({ wrong: z.string().min(1), why: z.string().min(3) })).default([]),
  })),
});

export type Guides = { goals: string[]; hints: string[][]; checks: Problem["step_checks"]; traps: Problem["error_traps"] };

// Ghi chỉ dẫn vào đề. Không có chỉ dẫn (g null) thì xóa hết: các phần song song với lời giải không được lệch số bước.
export const withGuides = (p: Problem, g: Guides | null): Problem => ({ ...p, step_goals: g?.goals ?? [], step_hints: g?.hints ?? [], step_checks: g?.checks ?? [], error_traps: g?.traps ?? [] });

// Kết quả chuẩn do AI viết phải có thật trong lời giải của bước đó, nếu không thì bỏ (AI bịa số).
const inStep = (result: string, step: string) => {
  const rn: string[] = numsIn(result), sn: string[] = numsIn(step);
  return rn.length ? rn.every((n) => sn.includes(n)) : canon(step).includes(canon(result));
};

// Các số xuất hiện lần đầu ở bước i (không có trong đề, dữ kiện, các bước trước): chính là kết quả bước đó tạo ra, gợi ý không được nêu.
const newNumbers = (steps: string[], i: number, p: Problem): string[] => {
  const seen = new Set<string>(numsIn(`${p.statement} ${JSON.stringify(p.data)} ${steps.slice(0, i).join(" ")}`));
  return [...new Set<string>(numsIn(stripStep(steps[i])))].filter((n) => !seen.has(n)).slice(0, 6);
};

// AI viết một lần lúc giáo viên bấm nút; lúc học sinh dùng thì không tốn lượt AI. Số phần tử phải khớp số bước, không khớp thì bỏ (trả null).
// Mục tiêu lộ đáp án (số kết quả) thì để trống: học sinh thấy ngay câu này. Gợi ý lộ thì runtime (stepHint) vẫn chặn.
export async function makeStepGuides(cfg: LlmCfg, p: Problem, steps = p.solution_steps): Promise<Guides | null> {
  if (!steps.length) return null;
  const errs = p.common_errors.length ? `\nSai lầm thường gặp:\n${p.common_errors.map((e) => `- ${e}`).join("\n")}` : "";
  const text = `Có ĐÚNG ${steps.length} bước, trả đúng ${steps.length} phần tử trong "steps", mỗi bước một phần tử, không gộp, không bỏ bước.
${p.statement}\nDữ liệu: ${JSON.stringify(p.data)}\nCác bước lời giải (số kèm "KHÔNG được nhắc" là kết quả mới của chính bước đó, tuyệt đối không xuất hiện trong goal, hints, why của bước đó):\n${steps.map((s, i) => { const ban = newNumbers(steps, i, p); return `${i + 1}. ${s}${ban.length ? `\n   KHÔNG được nhắc: ${ban.join(", ")}` : ""}`; }).join("\n")}${errs}`;
  let note = ""; // lý do lượt trước hỏng: báo cho AI để lượt sau không lặp lại
  for (let t = 0; t < 3; t++) {
    const raw = await askJson(cfg, SYSTEM + gradeRule(p.grade), [{ role: "user", text: text + note }], out, { maxTokens: 6000, use: "step_guides" }).catch(async (e) => { await reportError(e, `tạo chỉ dẫn từng bước, đề ${p.id}`, { teacherId: cfg.teacherId, actor: "teacher" }); return null; });
    // AI hay viết \times, \frac chỉ với một dấu gạch chéo ngược trong JSON: trả ký tự điều khiển về lệnh LaTeX trước khi kiểm và lưu.
    const x = raw && (walk(raw) as typeof raw);
    if (x && x.steps.length !== steps.length) await reportError(new Error(`AI trả sai số bước: ${x.steps.length}/${steps.length}, đề ${p.id}`), "tạo chỉ dẫn từng bước", { teacherId: cfg.teacherId, actor: "teacher", kind: "format" });
    if (x?.steps.length !== steps.length) { note = x ? `\nLần trước bạn trả ${x.steps.length} phần tử, SAI: phải đúng ${steps.length} phần tử.` : "\nLần trước JSON không hợp lệ. Trả lại đúng định dạng."; continue; }
    const given = [p.data, p.statement];
    return {
      goals: x.steps.map((s) => (leaks(s.goal, p.solution, given, steps) ? "" : s.goal.trim())),
      // Gợi ý lộ kết quả thì bỏ luôn (bot cũng sẽ chặn lúc chạy): mức đó dùng gợi ý chung của đề.
      hints: x.steps.map((s) => s.hints.map((h) => (leaks(h, p.solution, given, steps) ? "" : h))),
      checks: x.steps.map((s, i) => { const ok = s.result.trim() && inStep(s.result, stripStep(steps[i])); return { result: ok ? s.result.trim() : "", accepts: ok ? s.accepts.map((a) => a.trim()).filter(Boolean).slice(0, 3) : [] }; }),
      traps: x.steps.flatMap((s, i) => s.traps.slice(0, 2).filter((tr) => canon(tr.wrong) !== canon(s.result) && !leaks(tr.why, p.solution, [...given, tr.wrong], steps)).map((tr) => ({ step: i + 1, wrong: tr.wrong.trim(), why: tr.why.trim() }))),
    };
  }
  return null;
}
