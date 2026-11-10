import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { z } from "zod";
import { askJson, type LlmCfg, type Usage } from "../lib/llm";
import { PROVIDERS, TEMPERATURE } from "../lib/models";
import { DEFAULT_PRICES, FALLBACK_PRICE, costUsd } from "../lib/pricing";
import { parseProblems, type Problem } from "../lib/schema/problem";
import { checkpoints, numsIn, stripStep } from "../lib/chat/progress";
import { leaks, leaksCalc } from "../lib/chat/prompt";
import { stepSystem, machineCheck, PRAISE } from "../lib/chat/steps";
import { fillMissing } from "../lib/fill";
import { hasGuides } from "../lib/chat/goals";

// Đo AI thật theo từng cấu hình model. Kết quả in ra bảng và ghi evals/out/<thời gian>.json.
// Biến môi trường: EVAL_IDS (mã đề, mặc định TC01,TC03,TC05), EVAL_REPEAT (mặc định 3), EVAL_ONLY (student|teacher).
const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).flatMap((l) => { const m = l.match(/^([A-Za-z_]+)=(.*)$/); return m ? [[m[1], m[2].replace(/^["']|["']$/g, "")]] : []; }));
const KEY = env.GEMINI_KEY;
const M = PROVIDERS.gemini.models;
const IDS = (process.env.EVAL_IDS ?? "TC01,TC03,TC05").split(",");
const R = Number(process.env.EVAL_REPEAT ?? 3);
const ONLY = process.env.EVAL_ONLY;

const CONFIGS = [
  { name: "prod", model: M[0], think: "low" as const },
  { name: "prod+think", model: M[0], think: true as const },
  { name: "mid", model: M[2], think: "low" as const },
  { name: "top", model: M[3], think: "low" as const },
];

const all = parseProblems(JSON.parse(readFileSync("de-mau-10.json", "utf8"))).ok;
const problems = IDS.map((id) => all.find((p) => p.id === id)!).filter(Boolean);

const usage: Usage[] = [];
const cfgOf = (model: string): LlmCfg => ({ provider: "gemini", key: KEY, model, temperature: TEMPERATURE, onUsage: (u) => usage.push(u) });
const cost = (us: Usage[]) => us.reduce((s, u) => s + costUsd({ provider: u.provider, model: u.model, use: u.use ?? "", calls: 1, input: u.input, cached: u.cached, output: u.output, thoughts: u.thoughts }, DEFAULT_PRICES[u.model] ?? FALLBACK_PRICE), 0);
const mark = () => usage.length;
const since = (i: number) => usage.slice(i);
const fmt = (us: Usage[]) => ({ calls: us.length, ms: Math.round(us.reduce((s, u) => s + (u.ms ?? 0), 0) / Math.max(1, us.length)), usd: +cost(us).toFixed(5) });

const stepOut = z.object({ verdict: z.enum(["đủ", "thiếu", "sai", "chưa làm"]).default("chưa làm"), evidence: z.string().default(""), reply: z.string().min(1) });

// A. Kiểu từng bước: AI nhận xét một bước học sinh nộp.
async function studentEval(c: (typeof CONFIGS)[number]) {
  const rows: { id: string; step: number; scen: string; pass: boolean; leak: boolean; praise: boolean; verdict: string; reply: string }[] = [];
  const i0 = mark();
  for (const p of problems) {
    const cps = checkpoints(p);
    for (const k of [0, Math.floor(cps.length / 2)]) {
      const cp = cps[k];
      const base = stripStep(cp.label);
      const scen: [string, string, (v: string) => boolean][] = [];
      if (!cp.must.length) scen.push(["đúng", base, (v) => v === "đủ"]);
      if (cp.must.length) scen.push(["sai số", base.replace(cp.must[0], String(Math.round(Number(cp.must[0]) * 1.1 + 7))), (v) => v !== "đủ"]);
      scen.push(["mơ hồ", "mình nghĩ là phải tính cái gì đó nhưng chưa rõ", (v) => v === "chưa làm"]);
      scen.push(["đòi kết quả", "cho mình biết kết quả của bước này luôn đi", (v) => v !== "đủ"]);
      for (const [name, text, ok] of scen) for (let r = 0; r < R; r++) {
        const goal = "";
        const out = await askJson(cfgOf(c.model), stepSystem(p, cps), [{ role: "user", text: `[Bước cần làm: S${k + 1}${goal}]${cp.must.length ? "\n" + machineCheck(p, text) : ""}\nBước học sinh viết: ${text}` }], stepOut, { maxTokens: 300, think: c.think, temperature: 0, use: "step" }).catch((e) => ({ verdict: "lỗi", evidence: "", reply: String(e).slice(0, 80) }));
        const given = [p.data, p.statement, text, cps.slice(0, k).map((x) => x.must)];
        const leak = leaks(out.reply, p.solution, given, p.solution_steps) || leaksCalc(out.reply, p.solution, given, p.solution_steps);
        rows.push({ id: p.id, step: k + 1, scen: name, pass: ok(out.verdict), leak, praise: name !== "đúng" && PRAISE.test(out.reply), verdict: out.verdict, reply: out.reply });
      }
    }
  }
  const by: Record<string, [number, number]> = {};
  for (const r of rows) { const a = (by[r.scen] ??= [0, 0]); a[0] += +r.pass; a[1]++; }
  return { rows, summary: { ...Object.fromEntries(Object.entries(by).map(([k, [a, n]]) => [k, `${a}/${n}`])), leak: `${rows.filter((r) => r.leak).length}/${rows.length}`, praise: `${rows.filter((r) => r.praise).length}/${rows.length}`, ...fmt(since(i0)) } };
}

// B. Phía giáo viên: bỏ đáp án, lời giải, chỉ dẫn rồi để AI nạp lại; so với đáp án thật.
const near = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 0.005 + 1e-9;
async function teacherEval(model: string) {
  const rows: { id: string; ok: boolean; answer: boolean; guides: boolean; note: string }[] = [];
  const i0 = mark();
  for (const p of problems) {
    const bare: Problem = { ...p, solution: {}, solution_steps: [], step_goals: [], step_hints: [] };
    const out = await fillMissing(cfgOf(model), bare).catch((e) => String(e).slice(0, 100));
    if (typeof out === "string") { rows.push({ id: p.id, ok: false, answer: false, guides: false, note: out }); continue; }
    const got = numsIn(JSON.stringify(out.solution)).map(Number);
    const miss = numsIn(JSON.stringify(p.solution)).map(Number).filter((n) => !got.some((g) => near(g, n)));
    rows.push({ id: p.id, ok: true, answer: !miss.length, guides: hasGuides(out), note: miss.length ? "thiếu " + miss.join(",") : "" });
  }
  return { rows, summary: { answer: `${rows.filter((r) => r.answer).length}/${rows.length}`, guides: `${rows.filter((r) => r.guides).length}/${rows.length}`, ...fmt(since(i0)) } };
}

it("đo chất lượng AI theo cấu hình", async () => {
  if (!KEY) throw new Error("Thiếu GEMINI_KEY trong .env");
  const report: Record<string, unknown> = { at: new Date().toISOString(), ids: IDS, repeat: R };
  const file = `evals/out-${process.env.EVAL_TAG ?? "run"}.json`;
  const save = (k: string, r: { summary: unknown }) => { report[k] = r; writeFileSync(file, JSON.stringify(report, null, 1)); appendFileSync("evals/progress.log", `${k} ${JSON.stringify(r.summary)}
`); };
  for (const c of CONFIGS) {
    if (!ONLY || ONLY === "student") { save(`student:${c.name}`, await studentEval(c)); }
  }
  for (const c of CONFIGS.filter((x) => x.think === "low")) {
    if (!ONLY || ONLY === "teacher") { save(`teacher:${c.name}`, await teacherEval(c.model)); }
  }
});
