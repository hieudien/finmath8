import { z } from "zod";
import { askJson, type LlmCfg } from "@/lib/llm";
import { missingAnswers } from "@/lib/answer-check";
import { hasChoices, hasGuides } from "@/lib/chat/goals";
import { makeStepGuides } from "@/lib/step-guides";
import type { Problem } from "@/lib/schema/problem";

const SOLUTION_SYSTEM = `Giải bài Toán rồi trả đáp án chuẩn. Tự giải thật cẩn thận, đừng bịa số. Mỗi đáp án một phần tử {"name","value"}: số thì value là chuỗi số, ví dụ x = 3 là {"name":"x","value":"3"}; hệ hai ẩn x = 4, y = -3 là hai phần tử x và y; nhiều nghiệm đặt tên x1, x2; vô nghiệm hoặc đáp án chữ là {"name":"ket_luan","value":"vô nghiệm"}. Chỉ trả JSON {"answers":[{"name":string,"value":string}]}.`;

// Viết lời giải từng bước khớp đáp án đã có. Trả mảng bước, hoặc chuỗi lỗi để báo giáo viên.
export async function makeSteps(cfg: LlmCfg, p: Problem): Promise<string[] | string> {
  const out = await askJson(cfg, 'Viết lời giải từng bước (3–8 bước) cho bài Toán. Mỗi bước 1–2 câu, nêu rõ phép tính và kết quả trung gian CỤ THỂ (mỗi bước phải là một phép tính hay kết luận học sinh tự làm được, không viết bước chỉ chép lại dữ kiện đề), bước cuối là kết luận. Lời giải PHẢI ra đúng đáp án đã cho trong "solution". Chỉ trả JSON {"steps": [string]}.', [{ role: "user", text: `${p.statement ?? p.title}
Dữ liệu: ${JSON.stringify(p.data)}
Đáp án: ${JSON.stringify(p.solution)}` }], z.object({ steps: z.array(z.string().min(3)).min(2).max(12) }), { think: true });
  // Mọi số lớn trong đáp án phải xuất hiện trong lời giải, nếu không thì không dùng (AI giải lệch đáp án).
  const missing = missingAnswers(p.solution, out.steps);
  return missing.length ? `AI viết lời giải chưa khớp đáp án của đề (thiếu ${missing.join(", ")}). Bấm thử lại, hoặc kiểm tra lại đáp án trong đề.` : out.steps;
}

// Tạo chỉ dẫn + trắc nghiệm. Không tạo được trắc nghiệm (thường do lời giải có bước chung chung, không có phép tính) thì nhờ AI viết lại lời giải
// (makeSteps đã kiểm tra khớp đáp án) rồi tạo lại; vẫn không được thì giữ lời giải cũ. Trả null nếu AI không viết nổi cả chỉ dẫn.
// Lời giải giáo viên đã duyệt chỉ bị thay khi trắc nghiệm không tạo được, và chỉ khi bản mới ra đủ trắc nghiệm.
export async function guidesOrRewrite(cfg: LlmCfg, p: Problem): Promise<{ p: Problem; goals: string[]; hints: string[][]; choices: Problem["step_choices"]; rewrote: boolean } | null> {
  const g = await makeStepGuides(cfg, p);
  if (!g || g.choices.length) return g && { p, ...g, rewrote: false };
  const steps = await makeSteps(cfg, p).catch(() => null);
  if (steps && typeof steps !== "string") {
    const g2 = await makeStepGuides(cfg, p, steps);
    if (g2?.choices.length) return { p: { ...p, solution_steps: steps }, ...g2, rewrote: true };
  }
  return { p, ...g, rewrote: false };
}

// Nạp phần còn thiếu theo thứ tự: đáp án, lời giải từng bước, chỉ dẫn từng bước. Phần đã có thì giữ nguyên.
export async function fillMissing(cfg: LlmCfg, p: Problem): Promise<Problem | string> {
  let q = p;
  if (!Object.keys(q.solution).length) {
    const ref = q.solution_steps.length ? `\nLời giải tham khảo:\n${q.solution_steps.join("\n")}` : "";
    // Dạng mảng {name,value}: khung JSON của Gemini bỏ additionalProperties nên đối tượng tự do hay bị trả rỗng.
    const r = await askJson(cfg, SOLUTION_SYSTEM, [{ role: "user", text: `${q.statement ?? q.title}\nDữ liệu: ${JSON.stringify(q.data)}${ref}` }],
      z.object({ answers: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) })).min(1) }), { think: true });
    const solution = Object.fromEntries(r.answers.map((a) => [a.name, /^-?\d+(\.\d+)?$/.test(a.value.trim()) ? Number(a.value) : a.value]));
    if (q.solution_steps.length && missingAnswers(solution, q.solution_steps).length) return "Đáp án AI tính chưa khớp lời giải đang có. Mở đề, nhập đáp án bằng tay.";
    q = { ...q, solution };
  }
  if (!q.solution_steps.length) {
    const s = await makeSteps(cfg, q);
    if (typeof s === "string") return s;
    q = { ...q, solution_steps: s, step_goals: [], step_hints: [], step_choices: [] };
  }
  if (!hasGuides(q) || !hasChoices(q)) {
    const g = await guidesOrRewrite(cfg, q);
    if (!g) return "AI chưa viết được chỉ dẫn cho từng bước. Bấm thử lại.";
    q = { ...g.p, step_goals: g.goals, step_hints: g.hints, step_choices: g.choices };
  }
  return q;
}
