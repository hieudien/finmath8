import { z } from "zod";
import { askJson, type LlmCfg } from "@/lib/llm";
import { leaks } from "@/lib/chat/prompt";
import { numsIn, stripStep } from "@/lib/chat/progress";
import { canon } from "@/lib/answer-check";
import { gradeRule } from "@/lib/grade";
import { reportError } from "@/lib/errors";
import { walk } from "@/lib/latex-fix";
import { GUIDE_RULES, TAIL, makeStepFormats, makeStepGuides, newNumbers, noAccent, withGuides, type Guides } from "@/lib/step-guides";
import { usesProblemNumbers } from "@/lib/step-scaffold";
import type { Problem } from "@/lib/schema/problem";

// Một lượt AI cho cả chỉ dẫn (goal, hints, result, accepts, traps), dạng cần viết (format, example) và giàn đỡ (subs, analog).
// Thay cho ba lời gọi makeStepGuides + makeStepFormats + makeStepScaffold. Luật lọc bằng code giữ nguyên như ba hàm cũ.
// Đo (5 đề x 3 lượt): lint 0, đủ trường bằng ba lượt cũ, số lượt gọi 46 -> 21, token vào -29%, chi phí -12%, nhanh hơn.
// guidesFor là điểm vào cho fill.ts; ba hàm cũ vẫn là đường dự phòng khi lượt gộp lỗi hoặc lệch số bước.
const SCAFFOLD_RULES = `- format: MỘT CỤM DANH TỪ ngắn nói bạn cần ra cái gì ở bước này, để ghép vào câu "Bạn thử viết ra ... nhé" (ví dụ "hệ phương trình mới sau khi thay m = 1", "một phương trình theo ẩn x", "câu kết luận nghiệm của hệ"). KHÔNG bắt đầu bằng động từ (không "Viết", "Tính", "Lập"), KHÔNG nói về bố cục (số dòng, "mỗi phương trình một dòng", "có dấu =", "dạng"), KHÔNG lặp lại ý của goal (kể cả từ khóa như "nhân", "trừ"), KHÔNG nêu lý do hay mục đích (không "để ..."), KHÔNG nêu thao tác của lời giải (không "sau khi nhân", "sau khi trừ", "sau khi thế"), KHÔNG nêu kết quả, số mới của bước, hay biểu thức đã thay số.
- example: MỘT ví dụ NGẮN cách viết với bài khác hoặc số khác hẳn (không dùng số của đề, không dùng kết quả của bước), viết chữ thường, không LaTeX, không dấu $, chữ tiếng Việt phải có dấu đầy đủ (ví dụ "2x = 14 - 6", "a khác 0"). Không có ví dụ phù hợp thì "".
- subs: 2 đến 3 CÂU HỎI CON, chia nhỏ bước thành các việc nhỏ làm lần lượt (ví dụ "Đề cho biết những số nào?", "Bạn cần tìm đại lượng nào?", "Hai đại lượng đó liên hệ với nhau bằng phép tính nào?"). Mỗi câu hỏi chỉ rõ MỘT việc cụ thể của bước này, dẫn học sinh tới tự viết được bước. KHÔNG nêu kết quả, KHÔNG viết sẵn phép tính đã thay số của bước, KHÔNG chép lại câu của lời giải.
- analog: MỘT ví dụ tương tự: một bài nhỏ CÙNG DẠNG với bước này nhưng tình huống khác và SỐ KHÁC HẲN (tuyệt đối không dùng số nào của đề và của lời giải), giải ra 2 đến 3 dòng ngắn rồi nói "Bạn làm tương tự với số của đề nhé." Ví dụ này được phép có kết quả riêng của nó. Không có ví dụ phù hợp thì "".`;

const ALL_SYSTEM = `Viết CHỈ DẪN và GIÀN ĐỠ từng bước lời giải Toán cho học sinh đang làm bước đó. Mỗi bước gồm:\n${GUIDE_RULES}\n${SCAFFOLD_RULES}\n${TAIL}\nQUAN TRỌNG: mọi chữ tiếng Việt trong goal, hints, why, format, example, subs, analog (kể cả ví dụ ngắn) phải có dấu đầy đủ, KHÔNG viết không dấu.`;

const allOut = z.object({
  steps: z.array(z.object({
    goal: z.string().min(3),
    hints: z.array(z.string().min(3)).min(1).max(3),
    result: z.string().default(""),
    accepts: z.array(z.string()).default([]),
    traps: z.array(z.object({ wrong: z.string().min(1), why: z.string().min(3) })).default([]),
    format: z.string().default(""),
    example: z.string().default(""),
    subs: z.array(z.string().min(3)).max(4).default([]),
    analog: z.string().default(""),
  })),
});

const inStep = (result: string, step: string) => {
  const rn: string[] = numsIn(result), sn: string[] = numsIn(step);
  return rn.length ? rn.every((n) => sn.includes(n)) : canon(step).includes(canon(result));
};
export type All = Guides & { formats: string[]; examples: string[]; subs: string[][]; analogs: string[] };

export async function makeStepAll(cfg: LlmCfg, p: Problem, steps = p.solution_steps): Promise<All | null> {
  if (!steps.length) return null;
  const errs = p.common_errors.length ? `\nSai lầm thường gặp:\n${p.common_errors.map((e) => `- ${e}`).join("\n")}` : "";
  const text = `Có ĐÚNG ${steps.length} bước, trả đúng ${steps.length} phần tử trong "steps", mỗi bước một phần tử, không gộp, không bỏ bước.
${p.statement}\nDữ liệu: ${JSON.stringify(p.data)}\nCác bước lời giải (số kèm "KHÔNG được nhắc" là kết quả mới của chính bước đó, tuyệt đối không xuất hiện trong goal, hints, why, format, subs của bước đó):\n${steps.map((s, i) => { const ban = newNumbers(steps, i, p); return `${i + 1}. ${s}${ban.length ? `\n   KHÔNG được nhắc: ${ban.join(", ")}` : ""}`; }).join("\n")}${errs}`;
  let note = "";
  for (let t = 0; t < 3; t++) {
    const raw = await askJson(cfg, ALL_SYSTEM + gradeRule(p.grade), [{ role: "user", text: text + note }], allOut, { maxTokens: 9000, use: "step_guides" })
      .catch(async (e) => { await reportError(e, `tạo chỉ dẫn và giàn đỡ, đề ${p.id}`, { teacherId: cfg.teacherId, actor: "teacher" }); return null; });
    const x = raw && (walk(raw) as typeof raw);
    if (x && x.steps.length !== steps.length) await reportError(new Error(`AI trả sai số bước: ${x.steps.length}/${steps.length}, đề ${p.id}`), "tạo chỉ dẫn và giàn đỡ", { teacherId: cfg.teacherId, actor: "teacher", kind: "format" });
    if (x?.steps.length !== steps.length) { note = x ? `\nLần trước bạn trả ${x.steps.length} phần tử, SAI: phải đúng ${steps.length} phần tử.` : "\nLần trước JSON không hợp lệ. Trả lại đúng định dạng."; continue; }
    const given = [p.data, p.statement];
    const ok = (s: string) => (s && !leaks(s, p.solution, given, steps) ? s.trim() : "");
    const r: All = {
      goals: x.steps.map((s) => (leaks(s.goal, p.solution, given, steps) ? "" : s.goal.trim())),
      hints: x.steps.map((s) => s.hints.map((h) => (leaks(h, p.solution, given, steps) ? "" : h))),
      checks: x.steps.map((s, i) => { const good = s.result.trim() && inStep(s.result, stripStep(steps[i])); return { result: good ? s.result.trim() : "", accepts: good ? s.accepts.map((a) => a.trim()).filter(Boolean).slice(0, 3) : [] }; }),
      traps: x.steps.flatMap((s, i) => s.traps.slice(0, 2).filter((tr) => canon(tr.wrong) !== canon(s.result) && !leaks(tr.why, p.solution, [...given, tr.wrong], steps)).map((tr) => ({ step: i + 1, wrong: tr.wrong.trim(), why: tr.why.trim() }))),
      formats: x.steps.map((s) => ok(s.format)),
      examples: x.steps.map((s) => (noAccent(s.example) ? "" : ok(s.example))),
      subs: x.steps.map((s) => (s.subs.some((q) => leaks(q, p.solution, given, steps)) ? [] : s.subs.map((q) => q.trim()).filter(Boolean))),
      analogs: x.steps.map((s, i) => (s.analog && !leaks(s.analog, p.solution, given, steps) && !usesProblemNumbers(s.analog, p, steps, i) ? s.analog.trim() : "")),
    };
    // Ví dụ hoặc dạng cần viết bị lọc rỗng (hay vì ví dụ lộ số của đáp án): gọi riêng makeStepFormats bù đúng các chỗ rỗng, như đường cũ.
    if (r.formats.some((f) => !f) || r.examples.some((e) => !e)) {
      const f = await makeStepFormats(cfg, { ...p, step_goals: r.goals }, steps).catch(() => null);
      if (f) { r.formats = r.formats.map((v, i) => v || f.formats[i]); r.examples = r.examples.map((v, i) => v || f.examples[i]); }
    }
    return r;
  }
  return null;
}

// Chỉ dẫn đầy đủ cho một đề (chỉ dẫn, dạng cần viết, giàn đỡ). Lượt gộp lỗi thì rơi về makeStepGuides cũ (formats/scaffold do finishProblem bổ sung như trước).
export async function guidesFor(cfg: LlmCfg, p: Problem): Promise<Problem | null> {
  const a = await makeStepAll(cfg, p);
  if (a) return { ...withGuides(p, a), step_formats: a.formats, step_examples: a.examples, step_subs: a.subs, step_analog: a.analogs };
  const g = await makeStepGuides(cfg, p);
  return g ? withGuides(p, g) : null;
}
