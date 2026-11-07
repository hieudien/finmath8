import { mean, standardDeviation, sampleVariance } from "simple-statistics";

export type Sess = { id: string; link_id: string; seq: number; status: string; started_at: string; problem_code: string };
export type Ev = { session_id: string; identify: number; plan: number; calculate: number; explain: number; total: number; final_correct: boolean; max_hint_level: number; hint_count: number; errors: string[]; duration_s: number; survey_likert: number | null; confidence?: number | null };

export const r1 = (n: number) => Math.round(n * 10) / 10;

type Bar = { name: string; value: number };
// Kết quả hàm SQL link_summary (đã gom trong DB).
export type Summary = {
  sessions: number; done: number; rubric: Bar[]; totalAvg: number; correctPct: number; durationMin: number; hintAvg: number;
  totalDist: Bar[]; hintDist: Bar[]; errors: Bar[]; daily: Bar[]; likertAvg: number | null; likertN: number;
};

type G = { n: number; mean: number; sd: number; v: number }; // v = phương sai mẫu, sd = độ lệch chuẩn tổng thể

// t hai mẫu độc lập (phương sai gộp), tính từ số liệu đã gom sẵn trong DB (view tag_stats) hoặc từ mảng.
export function compareStats(a: G | undefined, b: G | undefined) {
  if (!a || !b || a.n < 2 || b.n < 2) return null;
  const wv = ((a.n - 1) * a.v + (b.n - 1) * b.v) / (a.n + b.n - 2);
  const t = (a.mean - b.mean) / Math.sqrt(wv * (1 / a.n + 1 / b.n));
  return { meanA: r1(a.mean), sdA: r1(a.sd), nA: a.n, meanB: r1(b.mean), sdB: r1(b.sd), nB: b.n, t: Number.isFinite(t) ? r1(t) : null };
}

export function compare(a: number[], b: number[]) {
  const g = (x: number[]): G | undefined => x.length < 2 ? undefined : { n: x.length, mean: mean(x), sd: standardDeviation(x), v: sampleVariance(x) };
  return compareStats(g(a), g(b));
}
