import { z } from "zod";
import { askJson, type LlmCfg } from "@/lib/llm";
import { canon, nums, texts } from "@/lib/answer-check";
import { smartModel } from "@/lib/models";
import { gradeRule } from "@/lib/grade";
import type { Problem } from "@/lib/schema/problem";

const SOLVE = `Giải bài Toán rồi trả đáp án. Tự giải thật cẩn thận từng bước, đừng bịa số. Mỗi đáp án một phần tử {"name","value"}: số thì value là chuỗi số thuần (không dấu ngăn nghìn, dấu thập phân là dấu chấm), ví dụ "275000", "0.5"; đáp án chữ hoặc biểu thức thì value là chữ ngắn gọn ("B", "vô nghiệm", "x=2"). Gồm cả đáp số cuối và các kết quả trung gian chính. Chỉ trả JSON {"answers":[{"name":string,"value":string}]}.`;
const JUDGE = `Bạn so sánh hai đáp án của cùng một bài Toán. Hai đáp án tương đương nếu cùng kết luận (viết khác nhau, thứ tự khác nhau vẫn tính là cùng). Chỉ trả JSON {"same":boolean,"reason":string (1 câu)}.`;

const near = (m: number, n: number) => Math.abs(m - n) <= Math.abs(n) * 0.005 + 1e-9;

// Số đáp án của đề không có trong lời giải độc lập. Chấp nhận số bằng hiệu của hai số trong lời giải (vd chênh lệch).
export function missingNums(want: number[], got: number[]): number[] {
  return [...new Set(want)].filter((n) => !got.some((m) => near(m, n)) && !got.some((a) => got.some((b) => near(Math.abs(a - b), n))));
}

// Kiểm bằng code (không AI): thay nghiệm vào đề. Hai dạng: hệ \begin{cases} ... \end{cases} mà mọi ẩn đều có nghiệm số trong đáp án,
// hoặc đề có đúng một phương trình trong $...$ và đáp án có đúng một ẩn. Chỉ hiểu số, + - * / ^, ngoặc, \frac, \cdot, \times;
// gặp gì lạ (căn, tham số, chữ, chia cho 0) thì "skip" (không kết luận). pass = mọi phương trình thỏa, fail = có phương trình không thỏa.
export type Sub = { state: "pass" | "fail" | "skip"; msg: string };
export const substituteCheck = (p: Problem): string => substituteState(p).msg;
export function substituteState(p: Problem): Sub {
  const SKIP: Sub = { state: "skip", msg: "" };
  const vars: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.solution)) if (typeof v === "number" && /^[a-z]$/.test(k)) vars[k] = v;
  if (!Object.keys(vars).length) return SKIP;
  const block = /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/.exec(p.statement);
  let rows: string[];
  if (block) rows = block[1].split(/\\{2,}/).map((r) => r.trim()).filter(Boolean);
  else {
    rows = [...p.statement.matchAll(/\$([^$]+)\$/g)].map((m) => m[1]).filter((s) => s.includes("="));
    if (rows.length !== 1 || Object.keys(vars).length !== 1) return SKIP;
  }
  const toJs = (s: string): string | null => {
    let t = s.replace(/\\left|\\right|\\,|\\;|\\!|&/g, "").replace(/\\dfrac|\\tfrac/g, "\\frac").replace(/\\cdot|\\times/g, "*");
    for (let i = 0; i < 20 && /\\frac\{[^{}]*\}\{[^{}]*\}/.test(t); i++) t = t.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "(($1)/($2))");
    t = t.replace(/\^\{([^{}]*)\}/g, "**($1)").replace(/\^/g, "**").replace(/\s+/g, "");
    t = t.replace(/(\d|\))(?=[a-z(])/g, "$1*").replace(/([a-z])(?=[(\d])/g, "$1*").replace(/([a-z])(?=[a-z])/g, "$1*");
    if (!/^[-+*/().\dxyz-]*$/.test(t.replace(/[a-z]/g, "x"))) return null; // chỉ còn số, toán tử, ngoặc và tên ẩn
    const names = t.match(/[a-z]/g) ?? [];
    return names.every((n) => n in vars) ? t : null;
  };
  const bad: string[] = [];
  if (!rows.length) return SKIP;
  for (const row of rows) {
    const sides = row.split("=");
    if (sides.length !== 2) return SKIP;
    const [l, r] = sides.map(toJs);
    if (l === null || r === null) return SKIP;
    try {
      const f = (e: string) => Number(new Function(...Object.keys(vars), `return ${e};`)(...Object.values(vars)));
      const a = f(l), b = f(r);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return SKIP; // chia cho 0: điều kiện xác định, không kết luận
      if (Math.abs(a - b) > 0.005 * Math.max(1, Math.abs(a), Math.abs(b))) bad.push(row);
    } catch { return SKIP; }
  }
  return bad.length ? { state: "fail", msg: `Thay nghiệm ${JSON.stringify(vars)} vào đề không thỏa phương trình: ${bad.join("; ")}.` } : { state: "pass", msg: "" };
}

// Kiểm chéo đáp án: một lượt giải độc lập bằng model mạnh (không cho thấy đáp án của đề) rồi so. Trả chuỗi cảnh báo, rỗng = khớp.
// Số: so bằng code. Chữ hoặc biểu thức: so chuỗi chính tắc, lệch thì nhờ AI so một lần.
export async function crossCheck(cfg: LlmCfg, p: Problem): Promise<string> {
  if (!Object.keys(p.solution).length) return "";
  const sub = substituteCheck(p);
  if (sub) return `Kiểm chéo đáp án: ${sub}`;
  const smart = { ...cfg, model: smartModel(cfg.provider) };
  const r = await askJson(smart, SOLVE + gradeRule(p.grade), [{ role: "user", text: `${p.statement}\nDữ liệu: ${JSON.stringify(p.data)}` }],
    z.object({ answers: z.array(z.object({ name: z.string(), value: z.string() })).min(1) }), { think: true, use: "cross_check", temperature: 0 });
  const gotN = r.answers.flatMap((a) => nums(a.value));
  const gotT = r.answers.map((a) => canon(a.value));
  const lack = missingNums(nums(p.solution), gotN);
  const wantT = texts(p.solution);
  const lackT = wantT.filter((t) => !gotT.some((g) => g === canon(t) || (canon(t).length > 2 && g.length > 0 && (g.includes(canon(t)) || canon(t).includes(g)))));
  const notes: string[] = [];
  if (lack.length) notes.push(`lời giải độc lập không ra ${lack.join(", ")}`);
  if (lackT.length) {
    const j = await askJson(smart, JUDGE, [{ role: "user", text: `Bài: ${p.statement}\nĐáp án của đề: ${JSON.stringify(p.solution)}\nĐáp án độc lập: ${JSON.stringify(r.answers)}` }], z.object({ same: z.boolean(), reason: z.string().default("") }), { use: "cross_check", temperature: 0 });
    if (!j.same) notes.push(`kết luận chữ khác (${j.reason.slice(0, 120)})`);
  }
  return notes.length ? `Kiểm chéo đáp án: ${notes.join("; ")}. Kiểm tra lại đáp án và lời giải của đề.` : "";
}

const AUDIT = `Bạn rà soát lời giải từng bước của một bài Toán. Tự tính lại MỌI phép biến đổi, thay số, khai triển, rút gọn, giải phương trình trong từng bước, độc lập, không dựa vào kết luận của lời giải.
Chỉ báo lỗi khi CHẮC CHẮN một phép tính hoặc suy luận SAI (khác cách trình bày không phải lỗi). Nếu không chắc thì ok = true.
Nếu có lỗi: step = số bước sai, wrong = đoạn ngắn chép từ bước đó, right = nội dung đúng (phải KHÁC wrong).
Chỉ trả JSON {"ok":boolean,"step":number,"wrong":string,"right":string}.`;

const stepsText = (p: Problem) => p.solution_steps.map((s, i) => `Bước ${i + 1}: ${s}`).join("\n");

// Lỗi chỉ tính khi chỗ sai và chỗ đúng khác nhau (người rà hay tự mâu thuẫn: nói "sai" rồi viết lại đúng chính điều đó). Rỗng = không có lỗi.
export function auditVerdict(r: { ok: boolean; step?: number; wrong?: string; right?: string }): string {
  if (r.ok) return "";
  const w = (r.wrong ?? "").trim(), g = (r.right ?? "").trim();
  if (!w || !g || canon(w) === canon(g)) return "";
  return `Bước ${r.step ?? "?"}: ${w}. Đúng phải là ${g}.`.slice(0, 400);
}

// Rà lỗi tính trong lời giải từng bước (kiểm chéo ở trên chỉ so đáp án cuối). Không đưa đáp án cho người rà: có đáp án thì nó neo vào đó (đáp án sai vẫn "xác nhận").
// Trả chuỗi mô tả lỗi, rỗng = không thấy lỗi.
export async function checkSteps(cfg: LlmCfg, p: Problem): Promise<string> {
  if (!p.solution_steps.length) return "";
  const smart = { ...cfg, model: smartModel(cfg.provider) };
  const r = await askJson(smart, AUDIT + gradeRule(p.grade), [{ role: "user", text: `${p.statement}
Lời giải:
${stepsText(p)}` }],
    z.object({ ok: z.boolean(), step: z.number().default(0), wrong: z.string().default(""), right: z.string().default("") }), { think: true, use: "cross_check", temperature: 0 });
  const err = auditVerdict(r);
  if (!err) return "";
  // Hỏi lại một lần: báo lỗi có thật không.
  const c = await askJson(smart, CONFIRM, [{ role: "user", text: `${p.statement}
Lời giải:
${stepsText(p)}
Báo lỗi: ${err}` }],
    z.object({ real: z.boolean() }), { think: true, use: "cross_check", temperature: 0 });
  return c.real ? err : "";
}

const CONFIRM = `Một người rà soát báo lỗi trong lời giải Toán. Tự tính lại bước bị nêu. Nếu bước đó thực sự sai về phép tính hoặc suy luận, real = true. Nếu bước đúng, hoặc báo lỗi tự mâu thuẫn, hoặc chỉ khác cách diễn đạt, real = false. Chỉ trả JSON {"real":boolean}.`;
