import { z } from "zod";
import { askJson, type LlmCfg } from "@/lib/llm";
import { missingAnswers, nums } from "@/lib/answer-check";
import { hasGuides } from "@/lib/chat/goals";
import { makeStepFormats, withGuides } from "@/lib/step-guides";
import { guidesFor } from "@/lib/step-all";
import { makeStepScaffold } from "@/lib/step-scaffold";
import { lintProblem } from "@/lib/lint";
import { aboveGrade, gradeRule } from "@/lib/grade";
import { checkSteps, crossCheck, substituteState } from "@/lib/verify-solution";
import { smartModel } from "@/lib/models";
import { repairProblem } from "@/lib/repair";
import { walk } from "@/lib/latex-fix";
import { FORMAT_RULE, FORMAT_JSON } from "@/lib/format-rule";
import { stripStep } from "@/lib/chat/progress";
import { solveOnce } from "@/lib/solve";
import { swallow } from "@/lib/errors";
import { wrapRecord } from "@/lib/math-wrap";
import type { Problem } from "@/lib/schema/problem";

export const SOLUTION_SYSTEM = `Giải bài Toán rồi trả đáp án chuẩn. Tự giải thật cẩn thận, đừng bịa số. Mỗi đáp án một phần tử {"name","value"}: số thì value là chuỗi số, ví dụ x = 3 là {"name":"x","value":"3"}; hệ hai ẩn x = 4, y = -3 là hai phần tử x và y; nhiều nghiệm đặt tên x1, x2; vô nghiệm hoặc đáp án chữ là {"name":"ket_luan","value":"vô nghiệm"}. Đáp án dạng điều kiện (tìm tham số, có nghiệm hay vô nghiệm) viết NGẮN GỌN một cụm, ví dụ {"name":"ket_luan","value":"m khác -4"}, không viết cả câu giải thích. Chỉ trả JSON {"answers":[{"name":string,"value":string}]}.`;

// Lời giải chi tiết đã qua bước giải riêng, đưa cho makeSteps làm tham khảo để các bước viết gọn không đổi kết quả.
export const referenceNote = (steps: string[]) => (steps.length ? `Lời giải tham khảo đã kiểm tra (viết gọn lại thành 3–8 bước, GIỮ ĐÚNG các kết quả):\n${steps.join("\n")}` : "");

const MAKE_STEPS = `Viết lời giải 3–8 bước cho bài Toán. Mỗi bước là MỘT phần tử riêng của "steps" (không gộp, không xuống dòng trong chuỗi, không ghi "Bước N"), 1–2 câu đủ chủ vị, kết thúc bằng dấu chấm; nhiều ý trong một bước ngăn bằng dấu chấm phẩy. Nêu phép tính và kết quả trung gian CỤ THỂ mà học sinh tự làm được (không chép lại dữ kiện đề). Bước cuối là kết luận. Lời giải PHẢI ra đúng "solution".
Đề nhiều ý a), b): lần lượt từng ý; bước đầu của ý a) mở đầu "a) ", ý b) mở đầu "b) " (tương tự c), d)). Bước cuối MỖI ý kết luận bằng công thức, ví dụ "Vậy $m = -6$ thì hệ có nghiệm duy nhất thỏa mãn đề."; không kết luận chung chung.
Trong JSON, mỗi dấu \\ của LaTeX viết gấp đôi (\\\\frac, \\\\times, \\\\begin).${FORMAT_RULE} Không xuống dòng trong chuỗi JSON.`;

// Viết lời giải từng bước khớp đáp án đã có. Trả mảng bước, hoặc chuỗi lỗi để báo giáo viên.
export async function makeSteps(cfg: LlmCfg, p: Problem, note = "", deadlineMs?: number): Promise<string[] | string> {
  const out = await askJson(cfg, MAKE_STEPS + gradeRule(p.grade), [{ role: "user", text: `${p.statement}
Dữ liệu: ${JSON.stringify(p.data)}
Đáp án: ${JSON.stringify(p.solution)}${note ? `\n${note}` : ""}` }], z.object({ steps: z.array(z.string().min(3)).min(2).max(8) }), { think: "low", use: "solution_steps", deadlineMs });
  // Mọi số lớn trong đáp án phải xuất hiện trong lời giải, nếu không thì không dùng (AI giải lệch đáp án).
  const steps = repairProblem({ ...p, solution_steps: out.steps }).solution_steps.map(stripStep); // tách phần tử nhiều dòng, sửa \ bị nuốt
  const missing = missingAnswers(p.solution, steps);
  return missing.length ? `AI viết lời giải chưa khớp đáp án của đề (thiếu ${missing.join(", ")}). Bấm thử lại, hoặc kiểm tra lại đáp án trong đề.` : steps;
}

// Nạp phần còn thiếu theo thứ tự: đáp án, lời giải từng bước, chỉ dẫn từng bước. Phần đã có thì giữ nguyên.
export async function fillMissing(cfg: LlmCfg, p: Problem, ref = ""): Promise<Problem | string> {
  let q = p;
  let reference = ref; // lời giải có sẵn (từ tệp nạp) làm tham khảo cho makeSteps; bước giải riêng bên dưới ghi đè nếu phải tự giải
  if (!Object.keys(q.solution).length) {
    // Bước giải riêng (lib/solve.ts): đo trên 10 đề đúng 30/30 so với 12/30 của lời gọi chỉ trả đáp án bên dưới. Lỗi hoặc lệch lời giải đang có thì rơi về cách cũ.
    const sv = await solveOnce(cfg, q).catch(swallow("giải đề (điền đáp án)", { teacherId: cfg.teacherId, actor: "teacher" }));
    if (sv && !(q.solution_steps.length && missingAnswers(sv.answers, q.solution_steps).length)) {
      q = { ...q, solution: sv.answers as Problem["solution"] };
      reference = referenceNote(sv.steps); // dòng giải chi tiết chỉ làm tham khảo; số bước hiển thị cho học sinh do makeSteps viết gọn lại
    }
  }
  if (!Object.keys(q.solution).length) {
    const ref = q.solution_steps.length ? `\nLời giải tham khảo:\n${q.solution_steps.join("\n")}` : "";
    // Dạng mảng {name,value}: khung JSON của Gemini bỏ additionalProperties nên đối tượng tự do hay bị trả rỗng.
    const r = await askJson(cfg, SOLUTION_SYSTEM + gradeRule(q.grade), [{ role: "user", text: `${q.statement}\nDữ liệu: ${JSON.stringify(q.data)}${ref}` }],
      z.object({ answers: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) })).min(1) }), { think: true, use: "answer" });
    const solution = Object.fromEntries(r.answers.map((a) => [a.name, /^-?\d+(\.\d+)?$/.test(a.value.trim()) ? Number(a.value) : a.value]));
    if (q.solution_steps.length && missingAnswers(solution, q.solution_steps).length) return "Đáp án AI tính chưa khớp lời giải đang có. Mở đề, nhập đáp án bằng tay.";
    q = { ...q, solution };
  }
  if (!q.solution_steps.length) {
    const s = await makeSteps(cfg, q, reference);
    if (typeof s === "string") return s;
    q = withGuides({ ...q, solution_steps: s }, null);
  }
  if (!hasGuides(q)) {
    const r = await guidesFor(cfg, q);
    if (!r) return "AI chưa viết được chỉ dẫn cho từng bước. Bấm thử lại.";
    q = r;
  }
  return q;
}

const deriveSystem = (keep: boolean) => `Đọc đề Toán, rút dữ kiện, ${keep ? "" : "tính đáp án chuẩn "}và viết phần phụ. Chỉ dựa vào đề, tự giải cẩn thận, đừng bịa số. Công thức trong $...$ LaTeX, KHÔNG dùng \\( \\) hay \\[ \\].
"data": mỗi dữ kiện của đề là {"name","value"} (CHỈ "name" không dấu, vd principal, rate, years; số thì value là chuỗi số; đề cho PHÂN SỐ thì giữ phân số "$\\\\frac{2}{5}$", không đổi sang thập phân; value là biểu thức, phân thức, căn, lũy thừa thì viết LaTeX BỌC trong $...$, vd "$\\\\frac{4}{x+y} + \\\\frac{1}{y-1} = 5$").
${keep ? "" : `"answers": mỗi đáp án {"name","value"}: số thì value là chuỗi số; nhiều nghiệm đặt x1, x2; điều kiện hoặc đáp án chữ là {"name":"ket_luan","value":"..."} NGẮN GỌN một cụm (vd "m khác -4").\n`}"skills": 2–3 kiến thức chính, mỗi mục một cụm ngắn. "learning_objectives": 2 mục tiêu. "common_errors": 2–3 sai lầm học sinh hay mắc với chính đề này.
"hints": đúng 3 mức: 1 chỉ hỏi định hướng; 2 gợi ý cách giải; 3 nêu bước tính đầu tiên, KHÔNG nêu kết quả cuối. "extension": một câu hỏi mở rộng.
Gợi ý, sai lầm, câu mở rộng: mỗi mục là câu đủ chủ vị, ngắn, kết thúc bằng dấu chấm (hoặc dấu hỏi). Mọi chữ tiếng Việt trong skills, learning_objectives, common_errors, hints, extension và đáp án chữ phải có dấu đầy đủ.
Trong JSON, mỗi dấu \\ của LaTeX viết gấp đôi (\\\\frac, \\\\times, \\\\begin).`;
const pairs = z.array(z.object({ name: z.string().min(1), value: z.string().min(1) }));
const toRecord = (a: { name: string; value: string }[]) => Object.fromEntries(a.map((x) => [x.name, /^-?\d+(\.\d+)?$/.test(x.value.trim()) ? Number(x.value) : x.value]));
const derived = z.object({
  data: pairs.default([]), answers: pairs.min(1),
  skills: z.array(z.string().min(1)).min(1).max(6), learning_objectives: z.array(z.string().min(1)).min(1).max(6),
  common_errors: z.array(z.string().min(1)).min(1).max(6), hints: z.array(z.string().min(1)).length(3), extension: z.string().min(1),
});

// Tạo lại mọi thứ suy ra từ đề bài (statement là nguồn duy nhất): data, đáp án, kỹ năng, mục tiêu, sai lầm thường gặp, gợi ý, câu mở rộng. Bỏ lời giải và chỉ dẫn cũ.
const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
// Model đôi khi trả cả khối chữ không dấu: mỗi khối chữ dài mà không có ký tự có dấu nào thì coi là lỗi.
export const unaccented = (r: { skills: string[]; learning_objectives: string[]; common_errors: string[]; hints: string[]; extension: string }) =>
  [r.skills, r.learning_objectives, r.common_errors, r.hints, [r.extension]].some((g) => { const t = g.join(" "); return t.length > 30 && !VI.test(t); });

// Hai bộ nghiệm cùng kết luận nếu cùng các số (không kể thứ tự, sai số 0,5%).
const sameAnswer = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const x = nums(a).sort((m, n) => m - n), y = nums(b).sort((m, n) => m - n);
  return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) <= Math.abs(y[i]) * 0.005 + 1e-9);
};

// Đáp án AI tính phải được bỏ phiếu: `first` (từ lượt tạo lại) cùng hai lượt giải độc lập, cần ít nhất hai bộ trùng nhau, rồi qua kiểm thay nghiệm bằng code.
// Không đồng thuận hoặc không thỏa đề thì trả null. Đáp án toàn chữ thì không so phiếu được, nhận `first`.
async function voteAnswer(cfg: LlmCfg, p: Problem, first: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const ok = (s: Record<string, unknown>) => substituteState({ ...p, solution: s }).state !== "fail";
  if (!nums(first).length) return first;
  // Lượt giải độc lập dùng bước giải riêng (lib/solve.ts); lượt sau đổi nhiệt độ để không lặp đúng lỗi của lượt trước.
  let n = 0;
  const solve = () => solveOnce(cfg, p, { temperature: n++ ? 0.5 : 0 }).then((r) => r?.answers ?? null, swallow("giải đề (bỏ phiếu đáp án)", { teacherId: cfg.teacherId, actor: "teacher" }));
  const second = await solve(); // trùng `first` thì đủ phiếu; lệch mới giải lượt thứ ba (tiết kiệm lượt suy nghĩ)
  const votes = [first, second, ...(second && sameAnswer(first, second) ? [] : [await solve()])].filter((v): v is Record<string, unknown> => !!v);
  const win = votes.find((v, i) => votes.some((w, j) => j !== i && sameAnswer(v, w)));
  return win && ok(win) ? win : null;
}

// Tạo lại phần suy ra từ đề bài (statement là nguồn duy nhất): data, kỹ năng, mục tiêu, sai lầm thường gặp, gợi ý, câu mở rộng. Bỏ lời giải và chỉ dẫn cũ.
// Đáp án: `keep` (đề đã có đáp án giáo viên duyệt hoặc đã qua kiểm thay nghiệm) thì giữ nguyên; không thì lấy bản bỏ phiếu, không đồng thuận thì báo lỗi.
async function rebuildFromStatement(cfg: LlmCfg, p: Problem, keep: boolean): Promise<Problem | string> {
  // Model mạnh: model nhỏ hay giải sai (đáp án lệch khi kiểm chéo), và cả đáp án lẫn phần phụ đều suy ra từ đây.
  // keep: đáp án đã có nên không giải lại (bỏ mục answers, bớt suy nghĩ), đưa đáp án vào để gợi ý và sai lầm khớp với nó.
  const smart = { ...cfg, model: smartModel(cfg.provider) };
  const ask = () => keep
    ? askJson(smart, deriveSystem(true) + FORMAT_RULE + FORMAT_JSON + gradeRule(p.grade), [{ role: "user", text: `${p.statement}\nĐáp án: ${JSON.stringify(p.solution)}` }], derived.omit({ answers: true }), { think: "low", use: "answer" })
    : askJson(smart, deriveSystem(false) + FORMAT_RULE + FORMAT_JSON + gradeRule(p.grade), [{ role: "user", text: p.statement }], derived, { think: true, use: "answer" });
  let r = await ask();
  if (unaccented(r)) r = await ask(); // thử lại một lần
  if (unaccented(r)) return "AI trả phần gợi ý, sai lầm thường gặp không có dấu tiếng Việt. Bấm chạy lại.";
  const solution = keep ? p.solution : await voteAnswer(cfg, p, toRecord((r as { answers?: { name: string; value: string }[] }).answers ?? []));
  if (!solution) return "Chưa có đáp án đáng tin: AI giải nhiều lần cho kết quả khác nhau hoặc không thỏa đề. Nhập đáp án đúng ở trang sửa đề rồi bấm chuẩn hóa lại.";
  return withGuides({
    ...p, data: toRecord(r.data), solution, skills: r.skills, learning_objectives: r.learning_objectives, common_errors: r.common_errors,
    hints: r.hints.map((text, i) => ({ level: i + 1, text })), extension: r.extension, solution_steps: [], reviewed: false, check_note: "",
  }, null);
}

// Chuẩn hóa một đề: lấy đề bài (statement) làm gốc, AI tạo lại data, lời giải, chỉ dẫn từng bước, gợi ý... (cái cũ bị thay hết).
// Đáp án cũ giữ nguyên khi giáo viên đã duyệt (không còn cảnh báo) hoặc đã qua kiểm thay nghiệm bằng code, và không bị code bắt sai;
// ngược lại AI giải lại có bỏ phiếu. Rồi finishProblem kiểm lời giải và lint. Không đạt thì trả chuỗi lỗi, đề cũ không bị ghi đè.
export async function standardizeProblem(cfg: LlmCfg, p: Problem, ref = ""): Promise<Problem | string> {
  const q0 = repairProblem(p), sub = substituteState(q0);
  const has = Object.keys(q0.solution).length > 0;
  // Đáp án khóa (giáo viên xác nhận) luôn giữ, kể cả khi code thấy không thỏa đề (khi đó ghi cảnh báo để giáo viên xem lại).
  const keep = has && (q0.answer_locked || sub.state === "pass");
  const q = await rebuildFromStatement(cfg, q0, keep);
  if (typeof q === "string") return q;
  const r = await finishProblem(cfg, q, keep, ref);
  return typeof r !== "string" && q0.answer_locked && sub.state === "fail" ? { ...r, check_note: sub.msg } : r;
}

const stale = (q: Problem) => lintProblem(q).length > 0 || q.step_checks.length !== q.solution_steps.length;

// Làm một đề đạt chuẩn để dùng luôn: kiểm chéo đáp án khớp, đủ lời giải và chỉ dẫn từng bước, lint sạch, đã duyệt.
// Không đạt thì trả chuỗi lỗi (không lưu đề dở). Kiểm chéo chỉ chạy với đề AI mới tạo hoặc đang có cảnh báo; đề giáo viên đã duyệt thì giữ nguyên đáp án.
// trusted: đáp án đã đáng tin (giáo viên duyệt hoặc qua kiểm bằng code): bỏ kiểm chéo bằng AI nhưng vẫn rà lỗi tính trong lời giải.
export async function finishProblem(cfg: LlmCfg, p0: Problem, trusted = false, ref = ""): Promise<Problem | string> {
  const w = walk(p0) as Problem;
  const p: Problem = { ...w, data: wrapRecord(w.data) as Problem["data"] }; // dữ kiện LaTeX trần thì bọc $...$ để hiện công thức
  // đề từ bước AI giải (normalize) có thể còn ký tự điều khiển do JSON nuốt dấu gạch chéo ngược: sửa trước khi kiểm lint (chỉ sửa ký tự, không làm gọn chữ)
  if (!trusted && Object.keys(p.solution).length && (!p.reviewed || p.check_note)) {
    const note = await crossCheck(cfg, p);
    if (note) return note;
  }
  let q = await fillMissing(cfg, p, ref);
  if (typeof q === "string") return q;
  // Đề mới hoặc đang có cảnh báo: rà lỗi tính trong lời giải (kiểm chéo chỉ so đáp án cuối). Sai thì viết lại một lần kèm chỗ sai, vẫn sai thì báo lỗi.
  if (trusted || !p.reviewed || p.check_note) {
    for (let t = 0; t < 2; t++) {
      const bad = await checkSteps(cfg, q);
      if (!bad) break;
      if (t) return `Lời giải AI viết chưa đạt: ${bad} Bấm chạy lại. Nếu lời giải đúng thì đáp án đang lưu có thể sai: mở đề, tự kiểm tra và sửa đáp án.`;
      const s = await makeSteps(cfg, q, `Lời giải trước bị sai: ${bad}. Tính lại thật cẩn thận từng phép tính, viết lại cho đúng.`);
      if (typeof s === "string") return s;
      const r = await fillMissing(cfg, withGuides({ ...q, solution_steps: s }, null));
      if (typeof r === "string") return r;
      q = r;
    }
  }
  // Lời giải dùng kiến thức vượt lớp: viết lại một lần kèm từ vi phạm (lint ở cuối vẫn chặn nếu còn).
  const above = aboveGrade(q);
  if (above.length && q.solution_steps.length) {
    const s = await makeSteps(cfg, q, `Lời giải trước vi phạm giới hạn lớp: ${above[0]} Viết lại CHỈ bằng kiến thức đến hết lớp ${q.grade}.`);
    if (typeof s === "string") return s;
    const r = await fillMissing(cfg, withGuides({ ...q, solution_steps: s }, null));
    if (typeof r === "string") return r;
    q = r;
  }
  // Chỉ dẫn lộ kết quả hoặc lệch số bước: viết lại, tối đa 2 lần.
  for (let t = 0; t < 2 && stale(q); t++) {
    const r = await guidesFor(cfg, q);
    if (!r) break;
    q = r;
  }
  // Dạng cần viết + ví dụ từng bước: bổ sung nếu thiếu. Lỗi AI thì bỏ qua (bot vẫn chạy bằng mục tiêu của bước).
  if (q.step_formats.length !== q.solution_steps.length) {
    const f = await makeStepFormats(cfg, q).catch(swallow("tạo dạng cần viết từng bước", { teacherId: cfg.teacherId, actor: "teacher" }));
    if (f) q = { ...q, step_formats: f.formats, step_examples: f.examples };
  }
  // Giàn đỡ cho học sinh kẹt: câu hỏi con + ví dụ tương tự. Lỗi AI thì bỏ qua (thang gợi ý rơi về gợi ý có sẵn).
  if (q.step_subs.length !== q.solution_steps.length || q.step_analog.length !== q.solution_steps.length) {
    const sc = await makeStepScaffold(cfg, q).catch(swallow("tạo giàn đỡ từng bước", { teacherId: cfg.teacherId, actor: "teacher" }));
    if (sc) q = { ...q, step_subs: sc.subs, step_analog: sc.analogs };
  }
  const left = lintProblem(q);
  if (left.length || q.step_checks.length !== q.solution_steps.length) return `AI chưa làm đề này đạt chuẩn: ${left.join(" ") || "chưa viết được chỉ dẫn từng bước."}`;
  return { ...q, reviewed: true, check_note: "" };
}
