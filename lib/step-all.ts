import { problemText } from "@/lib/figure";
import { z } from "zod";
import { askJson, type LlmCfg } from "@/lib/llm";
import { leaks } from "@/lib/chat/prompt";
import { numsIn, stripStep } from "@/lib/chat/progress";
import { canon } from "@/lib/answer-check";
import { gradeRule } from "@/lib/grade";
import { reportError } from "@/lib/errors";
import { walk } from "@/lib/latex-fix";
import { newNumbers, withGuides, type Guides } from "@/lib/step-guides";
import type { Problem } from "@/lib/schema/problem";

// Lúc chuẩn hóa chỉ viết phần để SERVER chấm (học sinh không thấy): kết quả chuẩn từng bước và các sai lầm cụ thể.
// Không còn việc cần làm, gợi ý, dạng cần viết, câu hỏi con, ví dụ theo bước: bot nhận xét và gợi ý lúc chạy, chỉ từ lời giải đã chuẩn hóa.
const CHECK_SYSTEM = `Với từng bước lời giải Toán, viết phần để máy chấm bài làm của học sinh. Mỗi bước gồm:
- result: kết quả chuẩn của bước, chép đúng từ lời giải. Số: số thuần, không dấu ngăn nghìn, thập phân dùng dấu chấm ("45000", "0.15"); biểu thức hoặc chữ: ngắn ("x=2", "vô nghiệm"). Bước chỉ nêu cách làm: "".
- accepts: tối đa 3 cách viết khác CÙNG giá trị với result mà học sinh có thể viết (ví dụ "15" khi result là "0.15"; "x = 2" khi result "x=2"). Thường để [].
- traps: 0–2 sai lầm CỤ THỂ hay gặp ở bước (theo "Sai lầm thường gặp"): wrong = kết quả SAI (số thuần hoặc biểu thức ngắn, KHÁC result); why = MỘT câu nói lỗi ở đâu và bảo kiểm lại, KHÔNG nêu kết quả đúng, không nhắc số thứ tự bước.
Không nêu kết quả của chính bước trong why. Xưng "mình", gọi học sinh là "bạn". Công thức trong $...$ LaTeX. Trong JSON, mỗi dấu \\ của LaTeX viết gấp đôi (\\\\frac, \\\\times, \\\\begin). Chữ tiếng Việt phải có dấu đầy đủ.`;

const out = z.object({
  steps: z.array(z.object({
    result: z.string().default(""),
    accepts: z.array(z.string()).default([]),
    traps: z.array(z.object({ wrong: z.string().min(1), why: z.string().min(3) })).default([]),
  })),
});

// Kết quả chuẩn do AI viết phải có thật trong lời giải của bước đó, nếu không thì bỏ (AI bịa số).
const inStep = (result: string, step: string) => {
  const rn: string[] = numsIn(result), sn: string[] = numsIn(step);
  return rn.length ? rn.every((n) => sn.includes(n)) : canon(step).includes(canon(result));
};

export async function makeStepChecks(cfg: LlmCfg, p: Problem, steps = p.solution_steps): Promise<Pick<Guides, "checks" | "traps"> | null> {
  if (!steps.length) return null;
  const errs = p.common_errors.length ? `\nSai lầm thường gặp:\n${p.common_errors.map((e) => `- ${e}`).join("\n")}` : "";
  const text = `Có ĐÚNG ${steps.length} bước, trả đúng ${steps.length} phần tử trong "steps", mỗi bước một phần tử, không gộp, không bỏ bước.
${p.statement}\nDữ liệu: ${JSON.stringify(p.data)}\nCác bước lời giải (số kèm "KHÔNG được nhắc" là kết quả mới của chính bước đó, không xuất hiện trong why của bước đó):\n${steps.map((s, i) => { const ban = newNumbers(steps, i, p); return `${i + 1}. ${s}${ban.length ? `\n   KHÔNG được nhắc: ${ban.join(", ")}` : ""}`; }).join("\n")}${errs}`;
  let note = ""; // lý do lượt trước hỏng: báo cho AI để lượt sau không lặp lại
  for (let t = 0; t < 3; t++) {
    const raw = await askJson(cfg, CHECK_SYSTEM + gradeRule(p.grade), [{ role: "user", text: text + note }], out, { maxTokens: 6000, use: "step_guides" })
      .catch(async (e) => { await reportError(e, `tạo kết quả chuẩn từng bước, đề ${p.id}`, { teacherId: cfg.teacherId, actor: "teacher" }); return null; });
    const x = raw && (walk(raw) as typeof raw);
    if (x && x.steps.length !== steps.length) await reportError(new Error(`AI trả sai số bước: ${x.steps.length}/${steps.length}, đề ${p.id}`), "tạo kết quả chuẩn từng bước", { teacherId: cfg.teacherId, actor: "teacher", kind: "format" });
    if (x?.steps.length !== steps.length) { note = x ? `\nLần trước bạn trả ${x.steps.length} phần tử, SAI: phải đúng ${steps.length} phần tử.` : "\nLần trước JSON không hợp lệ. Trả lại đúng định dạng."; continue; }
    const given = [p.data, p.statement, p.figure?.desc];
    return {
      checks: x.steps.map((s, i) => { const ok = s.result.trim() && inStep(s.result, stripStep(steps[i])); return { result: ok ? s.result.trim() : "", accepts: ok ? s.accepts.map((a) => a.trim()).filter(Boolean).slice(0, 3) : [] }; }),
      traps: x.steps.flatMap((s, i) => s.traps.slice(0, 2).filter((tr) => canon(tr.wrong) !== canon(s.result) && !leaks(tr.why, p.solution, [...given, tr.wrong], steps)).map((tr) => ({ step: i + 1, wrong: tr.wrong.trim(), why: tr.why.trim() }))),
    };
  }
  return null;
}

// Điểm vào cho fill.ts: ghi kết quả chuẩn vào đề (mọi chỉ dẫn theo bước cũ bị xóa).
export async function guidesFor(cfg: LlmCfg, p: Problem): Promise<Problem | null> {
  const a = await makeStepChecks(cfg, p);
  return a ? withGuides(p, a) : null;
}
