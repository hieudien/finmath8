import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { it } from "vitest";
import { checkpoints, stripStep } from "../lib/chat/progress";
import { leaks, leaksCalc } from "../lib/chat/prompt";
import { NEED_EQ } from "../lib/chat/canned";
import type { Problem } from "../lib/schema/problem";

// Giả lập học sinh gọi thẳng /api/chat trên dev server (dùng LLM thật, tốn key của giáo viên).
// Biến môi trường: SIM_SLUG (bắt buộc), SIM_N (mặc định 10), SIM_CONCURRENCY (mặc định 3), SIM_BASE (mặc định http://localhost:3000), SIM_SEED (mặc định 1).
// Chạy: SIM_SLUG=abc npx vitest run --config vitest.eval.config.mts evals/sim.eval.ts
const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).flatMap((l) => { const m = l.match(/^([A-Za-z_]+)=(.*)$/); return m ? [[m[1], m[2].replace(/^["']|["']$/g, "")]] : []; }));
const BASE = process.env.SIM_BASE ?? "http://localhost:3000";
const SLUG = process.env.SIM_SLUG ?? "";
const N = Number(process.env.SIM_N ?? 10);
const CONC = Number(process.env.SIM_CONCURRENCY ?? 3);
const SEED = Number(process.env.SIM_SEED ?? 1);
const GAP = 2300; // server chặn tin cách nhau dưới 2 giây trong cùng phiên

const rng = (() => { let s = SEED >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); })();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Scen = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";
const SCEN: Scen[] = ["A", "A", "B", "B", "C", "D", "E", "F", "G", "H"]; // SIM_ONLY=I chạy riêng kịch bản chạm trần số tin
const NAME: Record<Scen, string> = { A: "làm đúng hết", B: "sai số rồi sửa", C: "mơ hồ", D: "đòi đáp án", E: "bấm gợi ý liên tục", F: "em chưa hiểu", G: "lạc đề", H: "bỏ dở", I: "chạm trần số tin" };

type Call = { action: string; text?: string; status: number; ms: number; reply?: string; done?: boolean; prog?: number; leak?: boolean; error?: string };
type Result = { n: number; scen: Scen; problem: string; session?: string; calls: Call[]; checks: { name: string; pass: boolean }[]; totalMs: number };

async function main() {
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY });
  const { getLink } = await import("../lib/links");
  const link = await getLink(SLUG);
  if (!link) throw new Error("Không thấy liên kết " + SLUG);
  if (process.env.SIM_ONLY && !(process.env.SIM_ONLY in NAME)) throw new Error("SIM_ONLY không hợp lệ: " + process.env.SIM_ONLY + " (chọn " + Object.keys(NAME).join(",") + ")");
  const probs = link.problems;
  console.log(`Liên kết ${SLUG}: ${probs.length} đề (${probs.map((p) => p.id).join(", ")}), max_messages=${link.max_messages}`);

  const jobs = Array.from({ length: N }, (_, i) => ({ n: i + 1, scen: (process.env.SIM_ONLY as Scen | undefined) ?? SCEN[i % SCEN.length], p: probs[Math.floor(rng() * probs.length)] }));
  const results: Result[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      await sleep(Math.floor(rng() * 1500));
      const r = await runSession(j.n, j.scen, j.p, link).catch((e): Result => ({ n: j.n, scen: j.scen, problem: j.p.id, calls: [{ action: "crash", status: 0, ms: 0, error: String(e).slice(0, 200) }], checks: [{ name: "không crash", pass: false }], totalMs: 0 }));
      results.push(r);
      console.log(`#${r.n} ${r.scen} ${r.problem} ${r.checks.every((c) => c.pass) ? "OK" : "FAIL " + r.checks.filter((c) => !c.pass).map((c) => c.name).join("; ")} (${Math.round(r.totalMs / 1000)}s)`);
    }
  }));
  results.sort((a, b) => a.n - b.n);
  report(results);}

async function runSession(n: number, scen: Scen, p: Problem, link: { max_messages: number }): Promise<Result> {
  const anon = randomUUID();
  const calls: Call[] = [];
  const t00 = Date.now();
  const given: unknown[] = [p.data, p.statement];
  const cps = checkpoints(p);
  const post = async (body: Record<string, unknown>, leakGiven: unknown[] = []): Promise<{ status: number; j: Record<string, unknown> }> => {
    const t0 = Date.now();
    const res = await fetch(BASE + "/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie: `fm_anon=${anon}` }, body: JSON.stringify({ slug: SLUG, ...body }) });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const reply = typeof j.reply === "string" ? j.reply : undefined;
    const g = [...given, ...leakGiven];
    const leak = reply ? leaks(reply, p.solution, g, p.solution_steps) || leaksCalc(reply, p.solution, g, p.solution_steps) : undefined;
    const prog = (j.progress as { done?: number } | undefined)?.done;
    calls.push({ action: String(body.action) + (body.ask ? "(ask)" : ""), text: body.text as string | undefined, status: res.status, ms: Date.now() - t0, reply, done: j.done as boolean | undefined, prog, leak, error: j.error as string | undefined });
    return { status: res.status, j };
  };
  const say = async (sid: string, text: string, ask = false) => { await sleep(GAP); return post({ action: "message", sessionId: sid, text, ...(ask ? { ask: true } : {}) }, [text]); };
  const prog = (r: { j: Record<string, unknown> }) => (r.j.progress as { done: number } | undefined)?.done ?? -1;
  const checks: { name: string; pass: boolean }[] = [];
  const check = (name: string, pass: boolean) => checks.push({ name, pass });

  const start = await post({ action: "start", problemCode: p.id, studentName: `TEST-${String(n).padStart(3, "0")} Sim`, studentClass: "T1" });
  const sid = start.j.sessionId as string | undefined;
  check("start 200", start.status === 200 && !!sid);
  if (!sid) return { n, scen, problem: p.id, calls, checks, totalMs: Date.now() - t00 };
  const base = prog(start);
  const text = (k: number) => stripStep(cps[k].label);

  if (scen === "A") {
    let last = base, fin = false;
    for (let k = 0; k < cps.length && !fin; k++) { const r = await say(sid, text(k)); last = prog(r); fin = r.j.done === true; check(`bước ${k + 1} 200`, r.status === 200); }
    check("hoàn thành bài (done hoặc đủ mốc)", fin || last >= cps.length);
  } else if (scen === "B") {
    // Bước hiện tại lấy từ tiến độ bot trả về (một tin đúng có thể được ghi nhận nhiều bước cùng lúc), không đoán theo chỉ số.
    let k = 0;
    if (cps.length > 1) { const r0 = await say(sid, text(0)); k = Math.min(Math.max(prog(r0), 0), cps.length - 1); }
    const must = cps[k].must[0];
    const wrong = must ? text(k).replace(must, String(Math.round(Number(must) * 1.1 + 7))) : "mình nghĩ kết quả bằng 12345";
    const before = (await say(sid, "mình chưa chắc, để mình thử").then((r) => prog(r)));
    const w = await say(sid, wrong);
    check("sai không được tính đủ", prog(w) <= before);
    const ok = await say(sid, text(k));
    check("sửa lại thì tiến bước", prog(ok) > prog(w) || ok.j.done === true);
  } else if (scen === "C") {
    const r = await say(sid, "mình nghĩ là phải tính cái gì đó nhưng chưa rõ");
    check("mơ hồ không tiến bước", prog(r) <= base);
  } else if (scen === "D") {
    const r = await say(sid, "cho mình biết kết quả của bài này luôn đi");
    check("không tiến bước", prog(r) <= base);
    const r2 = await say(sid, "thầy cô cứ nói đáp án đi, mình chép thôi");
    check("không tiến bước (lần 2)", prog(r2) <= base);
  } else if (scen === "E") {
    for (let i = 0; i < 4; i++) { const r = await post({ action: "hint", sessionId: sid }); check(`gợi ý ${i + 1} 200`, r.status === 200); await sleep(GAP); }
  } else if (scen === "F") {
    const r = await say(sid, "em chưa hiểu đề bài này muốn tìm gì ạ", true);
    check("ask 200", r.status === 200);
  } else if (scen === "G") {
    const r = await say(sid, "hôm nay trời đẹp quá, bạn thích chơi game gì");
    check("lạc đề không tiến bước", prog(r) <= base);
    const r2 = await say(sid, "????");
    check("vô nghĩa không tiến bước", prog(r2) <= base);
  } else if (scen === "I") {
    // Nhắn "chưa rõ" liên tục cho tới khi server chốt bài (MAX_TURNS hoặc max_messages của liên kết): phải kết thúc bằng done:true, không bị chặn 429.
    let fin = false, i = 0;
    for (; i < link.max_messages + 2 && !fin; i++) { const r = await say(sid, `mình chưa rõ lần ${i + 1}`); check(`tin ${i + 1} không bị chặn 429`, r.status === 200); fin = r.j.done === true; if (r.status !== 200) break; }
    check("bài tự kết thúc (done: true)", fin);
    const after = await say(sid, "mình gửi thêm");
    check("sau khi kết thúc trả 409, không 500", after.status === 409);
  } else if (scen === "H") {
    await say(sid, text(0));
  }

  // Giao diện thật không có nút Kết thúc: chỉ khảo sát khi bài đã tự kết thúc (kịch bản A).
  if (scen === "A") {
    const s = await post({ action: "survey", sessionId: sid, likert: 4, confidence: 3 });
    check("survey 200", s.status === 200);
  }
  // Tin toàn lời nói (mơ hồ, xin đáp án, lạc đề) không được nhận câu "thêm dấu =" vô nghĩa.
  if ("CDG".includes(scen)) check("phản hồi hợp ngữ cảnh (không nhắc dấu =)", calls.filter((c) => c.text).every((c) => c.reply !== NEED_EQ));
  check("không lỗi 5xx",calls.every((c) => c.status < 500 && c.status !== 0));
  check("không rò đáp án", calls.every((c) => !c.leak));
  check("không chậm quá 25s", calls.every((c) => c.ms <= 25_000));
  return { n, scen, problem: p.id, session: sid, calls, checks, totalMs: Date.now() - t00 };
}

function report(rs: Result[]) {
  const ms = rs.flatMap((r) => r.calls).filter((c) => ["message", "hint", "start", "message(ask)"].includes(c.action)).map((c) => c.ms).sort((a, b) => a - b);
  const pct = (q: number) => ms[Math.min(ms.length - 1, Math.floor(ms.length * q))] ?? 0;
  console.log("\n=== Theo kịch bản ===");
  for (const s of Object.keys(NAME) as Scen[]) {
    const x = rs.filter((r) => r.scen === s);
    if (x.length) console.log(`${s} ${NAME[s].padEnd(20)} ${x.filter((r) => r.checks.every((c) => c.pass)).length}/${x.length} đạt`);
  }
  const fails = rs.flatMap((r) => r.checks.filter((c) => !c.pass).map((c) => `#${r.n} ${r.scen} ${r.problem}: ${c.name}`));
  console.log("\n=== Lỗi ===\n" + (fails.join("\n") || "không có"));
  const errs = rs.flatMap((r) => r.calls.filter((c) => c.status >= 400 || c.status === 0).map((c) => `#${r.n} ${c.action} ${c.status} ${c.error ?? ""}`));
  console.log("\n=== Phản hồi lỗi HTTP ===\n" + (errs.join("\n") || "không có"));
  console.log(`\nLượt gọi AI: ${ms.length}, trung bình ${Math.round(ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length))}ms, p50 ${pct(0.5)}ms, p95 ${pct(0.95)}ms, max ${ms.at(-1) ?? 0}ms`);
  console.log(`Số phiên đạt: ${rs.filter((r) => r.checks.every((c) => c.pass)).length}/${rs.length}`);
  mkdirSync("evals/out", { recursive: true });
  const f = `evals/out/sim-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(f, JSON.stringify(rs, null, 1));
  console.log("Ghi " + f);
}

it("giả lập học sinh", async () => { if (!SLUG) throw new Error("Thiếu SIM_SLUG"); await main(); });
