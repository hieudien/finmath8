import { z } from "zod";
import { askJson, type LlmCfg } from "@/lib/llm";
import { leaks } from "@/lib/chat/prompt";
import { numsIn, stripStep } from "@/lib/chat/progress";
import { canon } from "@/lib/answer-check";
import { gradeRule } from "@/lib/grade";
import { reportError } from "@/lib/errors";
import { walk } from "@/lib/latex-fix";
import type { Problem } from "@/lib/schema/problem";

const GUIDE_RULES = `- goal: MỘT câu ngắn nêu MỤC ĐÍCH cần đạt (động từ đích + đại lượng). KHÔNG nêu kết quả; KHÔNG nêu cách làm hay thao tác kèm số ("nhân với 2", "cộng vế với vế"); không chép câu của lời giải. Không mở đầu bằng động từ thao tác (Nhân, Cộng, Trừ, Thế, Rút, Quy đồng, Khai triển, Chia); dùng Biến đổi, Khử, Lập, Tìm, Tính, Kết luận, Viết lại. Đúng: "Biến đổi để hệ số của x ở hai phương trình bằng nhau"; sai: "Nhân phương trình thứ nhất với 2". Dữ kiện đề đã cho (giá trị tham số, tên ẩn, tên hệ, ý a/b) thì nêu cụ thể: "Thay m = 1 vào hệ (I)", không viết "thay giá trị của tham số vào hệ".
- hints: 3 mức, mỗi mức 1 câu, mỗi mức có thông tin MỚI, không câu rỗng ("thực hiện phép tính"). Mức 1: định hướng (nhìn vào đâu). Mức 2: cách làm (công thức hay phép nào). Mức 3: nói BẰNG LỜI phép biến đổi hoặc quy tắc và lý do (vd "nhân hai vế của một phương trình với một số để hệ số của x bằng nhau"), KHÔNG viết sẵn biểu thức đã thay số, KHÔNG nêu kết quả. Cách làm cụ thể chỉ ở mức 2–3.
- result: kết quả chuẩn của bước, chép đúng từ lời giải. Số: số thuần, không dấu ngăn nghìn, thập phân dùng dấu chấm ("45000", "0.15"); biểu thức hoặc chữ: ngắn ("x=2", "vô nghiệm"). Bước chỉ nêu cách làm: "".
- accepts: tối đa 3 cách viết khác CÙNG giá trị với result mà học sinh có thể viết (ví dụ "15" khi result là "0.15"; "x = 2" khi result "x=2"). Thường để [].
- traps: 0–2 sai lầm CỤ THỂ hay gặp ở bước (theo "Sai lầm thường gặp"): wrong = kết quả SAI (số thuần hoặc biểu thức ngắn, KHÁC result); why = MỘT câu nói lỗi ở đâu và bảo kiểm lại, KHÔNG nêu kết quả đúng.`;
const TAIL = `Không nêu kết quả của chính bước trong goal, hints, why. Xưng "mình", gọi học sinh là "bạn". Công thức trong $...$ LaTeX. Trong JSON, mỗi dấu \\ của LaTeX viết gấp đôi (\\\\frac, \\\\times, \\\\begin).`;

const SYSTEM = `Viết CHỈ DẪN từng bước lời giải Toán cho học sinh đang làm bước đó. Mỗi bước gồm:\n${GUIDE_RULES}\n${TAIL}`;

const out = z.object({
  steps: z.array(z.object({
    goal: z.string().min(3),
    hints: z.array(z.string().min(3)).min(1).max(3),
    result: z.string().default(""),
    accepts: z.array(z.string()).default([]),
    traps: z.array(z.object({ wrong: z.string().min(1), why: z.string().min(3) })).default([]),
  })),
});

const FORMAT_SYSTEM = `Với từng bước của lời giải một bài Toán, viết cho học sinh biết bước đó cần VIẾT RA dạng gì. Mỗi bước gồm:
- format: MỘT CỤM DANH TỪ ngắn nói bạn cần ra cái gì ở bước này, để ghép vào câu "Bạn thử viết ra ... nhé" (ví dụ "hệ phương trình mới sau khi thay m = 1", "một phương trình theo ẩn x", "câu kết luận nghiệm của hệ"). KHÔNG bắt đầu bằng động từ (không "Viết", "Tính", "Lập"), KHÔNG nói về bố cục (số dòng, "mỗi phương trình một dòng", "có dấu =", "dạng"), KHÔNG lặp lại ý của "Việc cần làm" đã cho kèm theo (kể cả từ khóa như "nhân", "trừ"), KHÔNG nêu lý do hay mục đích (không "để ..."), KHÔNG nêu thao tác của lời giải (không "sau khi nhân", "sau khi trừ", "sau khi thế"), KHÔNG nêu kết quả, số mới của bước, hay biểu thức đã thay số.
- example: MỘT ví dụ NGẮN cách viết với bài khác hoặc số khác hẳn (không dùng số của đề, không dùng kết quả của bước), viết chữ thường, không LaTeX, không dấu $, chữ tiếng Việt phải có dấu đầy đủ (ví dụ "2x = 14 - 6", "a khác 0"). Không có ví dụ phù hợp thì "".
Xưng "mình", gọi học sinh là "bạn". Tuyệt đối không nêu kết quả của chính bước đó. Chỉ trả JSON {"steps": [{"format": string, "example": string}]} đúng một phần tử cho mỗi bước, theo thứ tự các bước.`;
const formatOut = z.object({ steps: z.array(z.object({ format: z.string().min(3), example: z.string().default("") })) });

// Chỉ bổ sung dạng cần viết và ví dụ cho từng bước (không đụng goal, hints, traps đã có). Trả null nếu AI hỏng hoặc lệch số bước.
export async function makeStepFormats(cfg: LlmCfg, p: Problem, steps = p.solution_steps): Promise<{ formats: string[]; examples: string[] } | null> {
  if (!steps.length) return null;
  const text = `Có ĐÚNG ${steps.length} bước, trả đúng ${steps.length} phần tử.\n${p.statement}\nDữ liệu: ${JSON.stringify(p.data)}\nCác bước lời giải:\n${steps.map((s, i) => { const ban = newNumbers(steps, i, p); const goal = p.step_goals.length === steps.length ? p.step_goals[i] : ""; return `${i + 1}. ${s}${goal ? `\n   Việc cần làm (học sinh đã thấy): ${goal}` : ""}${ban.length ? `\n   KHÔNG được nhắc: ${ban.join(", ")}` : ""}`; }).join("\n")}`;
  const raw = await askJson(cfg, FORMAT_SYSTEM + gradeRule(p.grade), [{ role: "user", text }], formatOut, { maxTokens: 3000, use: "step_formats" }).catch(async (e) => { await reportError(e, `tạo dạng cần viết, đề ${p.id}`, { teacherId: cfg.teacherId, actor: "teacher" }); return null; });
  const x = raw && (walk(raw) as typeof raw);
  if (!x || x.steps.length !== steps.length) return null;
  const given = [p.data, p.statement];
  const ok = (s: string) => (s && !leaks(s, p.solution, given, steps) ? s.trim() : "");
  // Ví dụ viết tiếng Việt không dấu (ba từ ASCII liền nhau trở lên, khác với ký hiệu toán một chữ cái) thì bỏ.
  const noAccent = (s: string) => /[a-z]{2,}(?:s+[a-z]{2,}){2,}/i.test(s);
  return { formats: x.steps.map((s) => ok(s.format)), examples: x.steps.map((s) => (noAccent(s.example) ? "" : ok(s.example))) };
}

export type Guides = { goals: string[]; hints: string[][]; checks: Problem["step_checks"]; traps: Problem["error_traps"] };

// Ghi chỉ dẫn vào đề. Không có chỉ dẫn (g null) thì xóa hết: các phần song song với lời giải không được lệch số bước.
export const withGuides = (p: Problem, g: Guides | null): Problem => ({ ...p, step_goals: g?.goals ?? [], step_hints: g?.hints ?? [], step_checks: g?.checks ?? [], error_traps: g?.traps ?? [], step_formats: [], step_examples: [], step_subs: [], step_analog: [] });

// Kết quả chuẩn do AI viết phải có thật trong lời giải của bước đó, nếu không thì bỏ (AI bịa số).
const inStep = (result: string, step: string) => {
  const rn: string[] = numsIn(result), sn: string[] = numsIn(step);
  return rn.length ? rn.every((n) => sn.includes(n)) : canon(step).includes(canon(result));
};

// Các số xuất hiện lần đầu ở bước i (không có trong đề, dữ kiện, các bước trước): chính là kết quả bước đó tạo ra, gợi ý không được nêu.
export const newNumbers = (steps: string[], i: number, p: Problem): string[] => {
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
