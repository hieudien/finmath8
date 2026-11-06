import { mean, standardDeviation, tTestTwoSample } from "simple-statistics";

export type Sess = { id: string; link_id: string; seq: number; status: string; started_at: string; problem_code: string };
export type Ev = { session_id: string; identify: number; plan: number; calculate: number; explain: number; total: number; final_correct: boolean; max_hint_level: number; hint_count: number; errors: string[]; duration_s: number; survey_likert: number | null };

export const K_MIN = 3; // dưới ngưỡng này không hiện số liệu theo phiên: tránh đoán ra từng học sinh

const avg = (xs: number[]) => (xs.length ? mean(xs) : 0);
export const r1 = (n: number) => Math.round(n * 10) / 10;

export function summarize(sessions: Sess[], evals: Ev[], visits: number) {
  const done = sessions.filter((s) => s.status === "done").length;
  const enough = sessions.length >= K_MIN;
  const bucket = (f: (e: Ev) => number, size: number) => {
    const m = new Map<number, number>();
    evals.forEach((e) => m.set(f(e), (m.get(f(e)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ name: String(k * size), value: v }));
  };
  const errs = new Map<string, number>();
  evals.forEach((e) => e.errors.forEach((x) => errs.set(x, (errs.get(x) ?? 0) + 1)));
  const days = new Map<string, number>();
  sessions.forEach((s) => { const d = s.started_at.slice(0, 10); days.set(d, (days.get(d) ?? 0) + 1); });
  const likert = evals.map((e) => e.survey_likert).filter((x): x is number => x != null);
  return {
    visits, sessions: sessions.length, done, enough,
    completion: sessions.length ? Math.round((done / sessions.length) * 100) : 0,
    rubric: [
      { name: "Nhận diện", value: r1(avg(evals.map((e) => e.identify))) },
      { name: "Lập kế hoạch", value: r1(avg(evals.map((e) => e.plan))) },
      { name: "Tính toán", value: r1(avg(evals.map((e) => e.calculate))) },
      { name: "Giải thích", value: r1(avg(evals.map((e) => e.explain))) },
    ],
    totalAvg: r1(avg(evals.map((e) => e.total))),
    correctPct: evals.length ? Math.round((evals.filter((e) => e.final_correct).length / evals.length) * 100) : 0,
    durationMin: r1(avg(evals.map((e) => e.duration_s)) / 60),
    hintAvg: r1(avg(evals.map((e) => e.hint_count))),
    totalDist: bucket((e) => e.total, 1),
    hintDist: bucket((e) => e.max_hint_level, 1).map((x) => ({ name: "Mức " + x.name, value: x.value })),
    errors: [...errs.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })),
    daily: [...days.entries()].sort().map(([name, value]) => ({ name: name.slice(5), value })),
    likertAvg: likert.length ? r1(avg(likert)) : null,
    likertN: likert.length,
  };
}

export function compare(a: number[], b: number[]) {
  if (a.length < 2 || b.length < 2) return null;
  const t = tTestTwoSample(a, b, 0);
  return { meanA: r1(mean(a)), sdA: r1(standardDeviation(a)), nA: a.length, meanB: r1(mean(b)), sdB: r1(standardDeviation(b)), nB: b.length, t: t == null ? null : r1(t) };
}
