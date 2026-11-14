import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { streamText, type LlmCfg, type Usage } from "../lib/llm";
import { PROVIDERS, TEMPERATURE } from "../lib/models";
import { DEFAULT_PRICES, FALLBACK_PRICE, costUsd } from "../lib/pricing";
import { parseProblems, type Problem } from "../lib/schema/problem";
import { numsIn, stripStep } from "../lib/chat/progress";
import { leaks, leaksCalc } from "../lib/chat/prompt";
import { freeSystem, hasDerivation, reachedAnswer } from "../lib/chat/free";
import { fillMissing } from "../lib/fill";
import { hasChecks } from "../lib/chat/goals";

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

// A. Chat nộp bài làm tự do: một lượt AI nhận xét bài làm học sinh nộp (kiểu gia sư). Thời gian là thời gian đến chữ đầu tiên và tổng.
async function studentEval(c: (typeof CONFIGS)[number]) {
  const rows: { id: string; scen: string; pass: boolean; leak: boolean; firstMs: number; totalMs: number; reply: string }[] = [];
  const i0 = mark();
  for (const p of problems) {
    const full = p.solution_steps.map(stripStep).join("\n");
    const half = p.solution_steps.slice(0, Math.max(1, Math.floor(p.solution_steps.length / 2))).map(stripStep).join("\n");
    const first = p.solution_steps.length ? stripStep(p.solution_steps[0]) : "";
    const scen: [string, string, (r: string) => boolean][] = [
      ["đủ bài", full, (r) => !/<\s*SAI/i.test(r) && reachedAnswer(p, full) && hasDerivation(full)],
      ["một phần", half, (r) => !/<\s*SAI/i.test(r)],
      ["đòi đáp án", "cho mình biết đáp án luôn đi", () => true],
      ["chỉ nêu bước đầu", first, () => true],
    ];
    for (const [name, text, ok] of scen) for (let r = 0; r < R; r++) {
      const t0 = Date.now(); let t1 = 0, buf = "";
      await streamText(cfgOf(c.model), freeSystem(p), [{ role: "user", text: `Bài làm của học sinh: ${text}` }], (x) => { t1 ||= Date.now() - t0; buf += x; }, { think: c.think === true ? true : c.think === "low" ? "low" : false, maxTokens: 500, deadlineMs: 60_000, use: "reply" });
      const given = [p.data, p.statement, text];
      const leak = !reachedAnswer(p, text) && (leaks(buf.replace(/<[^>]*>/g, ""), p.solution, given, p.solution_steps) || leaksCalc(buf.replace(/<[^>]*>/g, ""), p.solution, given, p.solution_steps));
      rows.push({ id: p.id, scen: name, pass: ok(buf), leak, firstMs: t1, totalMs: Date.now() - t0, reply: buf });
    }
  }
  const by: Record<string, [number, number]> = {};
  for (const r of rows) { const a = (by[r.scen] ??= [0, 0]); a[0] += +r.pass; a[1]++; }
  const avg = (k: "firstMs" | "totalMs") => Math.round(rows.reduce((x, r) => x + r[k], 0) / Math.max(1, rows.length));
  return { rows, summary: { ...Object.fromEntries(Object.entries(by).map(([k, [a, n]]) => [k, `${a}/${n}`])), leak: `${rows.filter((r) => r.leak).length}/${rows.length}`, firstMs: avg("firstMs"), totalMs: avg("totalMs"), ...fmt(since(i0)) } };
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
    rows.push({ id: p.id, ok: true, answer: !miss.length, guides: hasChecks(out), note: miss.length ? "thiếu " + miss.join(",") : "" });
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
