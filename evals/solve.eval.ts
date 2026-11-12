import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { z } from "zod";
import { askJson, type LlmCfg, type Usage } from "../lib/llm";
import { PROVIDERS, TEMPERATURE, type Provider } from "../lib/models";
import { DEFAULT_PRICES, FALLBACK_PRICE, costUsd } from "../lib/pricing";
import { SOLUTION_SYSTEM } from "../lib/fill";
import { gradeRule } from "../lib/grade";
import { nums } from "../lib/answer-check";
import { tidyAnswers, solveReliable, type Mode } from "../lib/solve";

// Đo bước GIẢI trên đề có đáp án chuẩn (nhiều đề có tham số). So 4 phương án cùng model:
//   base: cách hiện tại (SOLUTION_SYSTEM, một lần, trả JSON chỉ có đáp án)
//   once: bước giải riêng (prompt mới, có thay số kiểm công thức), một lần
//   verify: once + thay số kiểm bằng lần gọi riêng, không đạt thì giải lại
//   vote: hai lần giải song song so nhau, lệch thì lần ba lấy đa số
// Biến môi trường: SOLVE_REPEAT (mặc định 3), SOLVE_METHODS (mặc định base,once,verify,vote), SOLVE_IDS.
const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).flatMap((l) => { const m = l.match(/^([A-Za-z_]+)=(.*)$/); return m ? [[m[1], m[2].replace(/^["']|["']$/g, "")]] : []; }));
let AUTH: { provider: Provider; key: string } = { provider: "gemini", key: env.GEMINI_KEY };
// SOLVE_TEACHER=<email>: dùng key của giáo viên trong DB (giải mã bằng APP_SECRET) thay cho GEMINI_KEY. Không in key.
async function useTeacherKey(email: string) {
  Object.assign(process.env, { APP_SECRET: env.APP_SECRET, NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY });
  const { admin } = await import("../lib/supabase/admin");
  const { decrypt } = await import("../lib/crypto");
  const sb = admin();
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 200 });
  const u = list.users.find((x) => x.email === email);
  if (!u) throw new Error("Không thấy giáo viên " + email);
  const { data } = await sb.from("teacher_settings").select("gemini_key_enc").eq("teacher_id", u.id).maybeSingle();
  const enc = (data as { gemini_key_enc: string | null } | null)?.gemini_key_enc;
  if (!enc) throw new Error("Giáo viên chưa có API key");
  AUTH = { provider: "gemini", key: decrypt(enc) };
  console.log("Dùng key giáo viên, model:", PROVIDERS.gemini.models[0]);
}
const R = Number(process.env.SOLVE_REPEAT ?? 3);
const METHODS = (process.env.SOLVE_METHODS ?? "base,once,verify,vote").split(",");
const raw = String.raw;

// expect: các số của đáp án cuối (thứ tự không quan trọng). Đã tự thay lại vào đề để chắc đúng.
const SET: { id: string; grade: number; statement: string; expect: number[]; kind: "param" | "plain" }[] = [
  { id: "P1", grade: 9, kind: "param", expect: [-6], statement: raw`Cho hệ phương trình $\begin{cases} x + 2y = m + 3 \\ 2x - 3y = m \end{cases}$ $(I)$ ($m$ là tham số).
a) Giải hệ phương trình $(I)$ khi $m = 1$.
b) Tìm $m$ để hệ $(I)$ có nghiệm duy nhất $(x; y)$ thỏa mãn $x + y = -3$.` },
  { id: "P2", grade: 9, kind: "param", expect: [1], statement: raw`Cho hệ phương trình $\begin{cases} x + 2y = m + 3 \\ 2x - 3y = m \end{cases}$ ($m$ là tham số). Tìm $m$ để hệ có nghiệm duy nhất $(x; y)$ thỏa mãn $x - y = 1$.` },
  { id: "P3", grade: 9, kind: "param", expect: [14 / 3], statement: raw`Cho hệ phương trình $\begin{cases} 3x - y = m \\ x + 2y = 7 \end{cases}$ ($m$ là tham số). Tìm $m$ để hệ có nghiệm $(x; y)$ thỏa mãn $x = y$.` },
  { id: "P4", grade: 9, kind: "param", expect: [1 / 3], statement: raw`Cho hệ phương trình $\begin{cases} mx + y = 3 \\ x - y = 1 \end{cases}$ ($m$ là tham số). Tìm $m$ để hệ có nghiệm $(x; y)$ thỏa mãn $x + y = 5$.` },
  { id: "P5", grade: 9, kind: "param", expect: [3.5], statement: raw`Cho hệ phương trình $\begin{cases} x - 2y = m - 1 \\ 2x + y = 3m + 2 \end{cases}$ ($m$ là tham số). Tìm $m$ để hệ có nghiệm $(x; y)$ thỏa mãn $x - y = 4$.` },
  { id: "P6", grade: 9, kind: "param", expect: [6], statement: raw`Cho phương trình $x^2 - 5x + m = 0$ ($m$ là tham số). Tìm $m$ để phương trình có hai nghiệm $x_1, x_2$ thỏa mãn $x_1^2 + x_2^2 = 13$.` },
  { id: "P7", grade: 9, kind: "plain", expect: [4, -3], statement: raw`Giải hệ phương trình $\begin{cases} 3x + 2y = 6 \\ 2x - 2y = 14 \end{cases}$.` },
  { id: "P8", grade: 9, kind: "plain", expect: [8, 2], statement: raw`Giải hệ phương trình $\begin{cases} \frac{x + y}{5} = \frac{x - y}{3} \\ \frac{x}{4} = \frac{y}{2} + 1 \end{cases}$.` },
  { id: "P9", grade: 9, kind: "plain", expect: [64, 36], statement: "Hai số có tổng bằng 100 và hiệu bằng 28. Tìm hai số đó." },
  { id: "P10", grade: 9, kind: "plain", expect: [45, 15], statement: "Hiện nay tuổi mẹ gấp 3 lần tuổi con. Cách đây 5 năm, tuổi mẹ gấp 4 lần tuổi con. Hỏi hiện nay mẹ và con mỗi người bao nhiêu tuổi?" },
];
const IDS = process.env.SOLVE_IDS?.split(",");
const problems = SET.filter((p) => !IDS || IDS.includes(p.id));

const near = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 0.005 + 0.01;
// Đúng khi mọi số chuẩn đều có trong đáp án và đáp án không thừa quá 2 số.
const correct = (expect: number[], got: Record<string, unknown> | null) => {
  if (!got) return false;
  const g = nums(got);
  return expect.every((e) => g.some((v) => near(v, e))) && g.length <= expect.length + 2;
};

const pairs = z.object({ answers: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) })).min(1) });
type Out = { got: Record<string, unknown> | null; flagged: boolean; calls: number; ms: number; usage: Usage[]; err?: string };

async function run(method: string, p: (typeof SET)[number]): Promise<Out> {
  const usage: Usage[] = [];
  const cfg: LlmCfg = { provider: AUTH.provider, key: AUTH.key, model: PROVIDERS[AUTH.provider].models[0], temperature: TEMPERATURE, onUsage: (u) => usage.push(u) };
  const t0 = Date.now();
  try {
    if (method === "base") {
      const r = await askJson(cfg, SOLUTION_SYSTEM + gradeRule(p.grade), [{ role: "user", text: p.statement }], pairs, { think: true, use: "answer" });
      return { got: tidyAnswers(Object.fromEntries(r.answers.map((a) => [a.name, /^-?\d+(\.\d+)?$/.test(a.value.trim()) ? Number(a.value) : a.value]))), flagged: false, calls: 1, ms: Date.now() - t0, usage };
    }
    const r = await solveReliable(cfg, p, method as Mode);
    return { got: r.solved?.answers ?? null, flagged: r.flagged, calls: r.calls, ms: Date.now() - t0, usage };
  } catch (e) {
    return { got: null, flagged: true, calls: usage.length, ms: Date.now() - t0, usage, err: String(e).slice(0, 240) };
  }
}

async function pool<T>(jobs: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const k = i++; out[k] = await jobs[k](); } }));
  return out;
}

const usd = (us: Usage[]) => us.reduce((s, u) => s + costUsd({ provider: u.provider, model: u.model, use: u.use ?? "", calls: 1, input: u.input, cached: u.cached, output: u.output, thoughts: u.thoughts }, DEFAULT_PRICES[u.model] ?? FALLBACK_PRICE), 0);

it("đo bước giải", async () => {
  if (process.env.SOLVE_TEACHER) await useTeacherKey(process.env.SOLVE_TEACHER);
  const jobs = METHODS.flatMap((m) => problems.flatMap((p) => Array.from({ length: R }, (_, r) => async () => ({ m, p, r, o: await run(m, p) }))));
  const res = await pool(jobs, Number(process.env.SOLVE_CONC ?? 2));
  const rows = METHODS.map((m) => {
    const rs = res.filter((x) => x.m === m);
    const n = rs.length;
    const ok = (x: (typeof rs)[number]) => correct(x.p.expect, x.o.got);
    const good = rs.filter((x) => !x.o.flagged && ok(x)).length;
    const wrongAccepted = rs.filter((x) => !x.o.flagged && !ok(x)).length;
    const flaggedGood = rs.filter((x) => x.o.flagged && ok(x)).length;
    const flaggedBad = rs.filter((x) => x.o.flagged && !ok(x)).length;
    const avg = (f: (x: (typeof rs)[number]) => number) => rs.reduce((s, x) => s + f(x), 0) / n;
    return { method: m, runs: n, correctAccepted: good, wrongAccepted, flaggedCorrect: flaggedGood, flaggedWrong: flaggedBad,
      accuracyAccepted: n ? +(good / n).toFixed(3) : 0, avgCalls: +avg((x) => x.o.calls).toFixed(2), avgSec: +(avg((x) => x.o.ms) / 1000).toFixed(1), usdPerRun: +(rs.reduce((s, x) => s + usd(x.o.usage), 0) / n).toFixed(5) };
  });
  const byProblem = problems.map((p) => ({ id: p.id, kind: p.kind, ...Object.fromEntries(METHODS.map((m) => { const rs = res.filter((x) => x.m === m && x.p.id === p.id); return [m, `${rs.filter((x) => !x.o.flagged && correct(p.expect, x.o.got)).length}/${rs.length}`]; })) }));
  console.table(rows);
  console.table(byProblem);
  mkdirSync("evals/out", { recursive: true });
  writeFileSync(`evals/out/solve-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, JSON.stringify({ rows, byProblem, detail: res.map((x) => ({ m: x.m, id: x.p.id, r: x.r, got: x.o.got, flagged: x.o.flagged, calls: x.o.calls, ms: x.o.ms, err: x.o.err })) }, null, 1));
});
