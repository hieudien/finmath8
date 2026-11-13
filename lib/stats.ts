import { mean, standardDeviation, sampleVariance } from "simple-statistics";
import type { supabaseServer } from "@/lib/supabase/server";

export type Sess = { id: string; link_id: string; seq: number; status: string; started_at: string; problem_code: string; student_code: string | null; student_name: string | null; student_class?: string | null; revealed?: number; struggled?: number };
export const bits = (n: number) => n.toString(2).replace(/0/g, "").length; // số bit 1 của mặt nạ (số bước được giải hộ)
// Khóa nội bộ của học sinh: tên bỏ dấu + lớp, in hoa. Cùng tên cùng lớp là một học sinh.
export const studentKey = (name: string, cls: string) => `${name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^A-Za-z0-9]/g, "").toUpperCase()}.${cls.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`;
// Học sinh cũ chưa có lớp thì hiện mã cũ trong ngoặc.
export const who = (x: { seq: number; student_code: string | null; student_name: string | null; student_class?: string | null }) => x.student_name ? `${x.student_name} (${x.student_class || x.student_code})` : `Ẩn danh (cũ) #${x.seq}`;
export type Ev = { session_id: string; identify: number; plan: number; calculate: number; explain: number; total: number; final_correct: boolean; max_hint_level: number; hint_count: number; errors: string[]; duration_s: number };

export const r1 = (n: number) => Math.round(n * 10) / 10;

type Bar = { name: string; value: number };
// Kết quả hàm SQL link_summary (đã gom trong DB).
export type Summary = {
  sessions: number; done: number; rubric: Bar[]; totalAvg: number; correctPct: number; durationMin: number; hintAvg: number;
  totalDist: Bar[]; hintDist: Bar[]; errors: Bar[]; daily: Bar[];
};

// Kết quả hàm SQL link_problem_stats: mỗi đề những học sinh nào và trạng thái từng em.
// ok = tự làm được (có phiên đúng, không bị giải hộ; một lần là đủ); helped = đúng nhưng có giải hộ; wrong = chấm rồi chưa đúng; none = chưa nộp.
export type PState = "ok" | "helped" | "wrong" | "none";
export type ProblemStat = { code: string; students: { code: string | null; name: string | null; class: string | null; sessions: number; state: PState }[] };
export const P_STATE: Record<PState, { text: string; tone: "success" | "warn" | "danger" | "neutral" }> = { ok: { text: "Tự làm được", tone: "success" }, helped: { text: "Đúng nhưng có giải hộ", tone: "warn" }, wrong: { text: "Chưa đúng", tone: "danger" }, none: { text: "Chưa nộp", tone: "neutral" } };

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

// Số tin học sinh đã gửi theo phiên (không tính lời chào của bot). Đếm bản ghi con trong DB nên không dính giới hạn 1000 dòng.
// Lỗi đọc thì trả map thiếu: phiên không có trong map là "chưa biết", không gắn nhãn "Chưa trả lời".
export async function studentMsgs(sb: Awaited<ReturnType<typeof supabaseServer>>, ids: string[]) {
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb.from("chat_sessions").select("id,messages(count)").in("id", ids.slice(i, i + 100)).eq("messages.role", "student");
    if (error) continue;
    for (const r of (data ?? []) as unknown as { id: string; messages: { count: number }[] | null }[]) out.set(r.id, r.messages?.[0]?.count ?? 0);
  }
  return out;
}

// Trạng thái hiển thị của một phiên: đã chấm thì nêu kết quả; chưa chấm mà học sinh chưa nhắn gì là "Chưa trả lời".
export function sessionState(x: { status: string }, ev: { final_correct: boolean } | null | undefined, msgs: number | undefined) {
  if (ev) return ev.final_correct ? "Đúng" : "Chưa đúng";
  if (msgs === 0) return "Chưa trả lời";
  return x.status === "active" ? "Đang làm" : "Bỏ dở";
}
export const fmtTime = (iso: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));

// Bước học sinh gặp khó. struggled/revealed là mặt nạ bit theo bước (cùng cách đánh bit với progress).
export type StepInfo = { title: string; steps: string[]; goals: string[] };
type SRow = { id: string; problem_code: string; student_code: string | null; student_name?: string | null; struggled?: number; revealed?: number; started_at?: string };
const cut = (t: string) => { const s = t.replace(/^Bước \d+\s*[:.)-]\s*/i, ""); return s.length > 70 ? s.slice(0, 70) + "…" : s; };
const label = (p: StepInfo, i: number) => cut(p.goals[i] || p.steps[i]);

// Cả lớp: đếm số học sinh (không phải số phiên) gặp khó ở từng bước của từng đề, kèm danh sách học sinh. Nhiều nhất trước.
export function hardSteps(ss: SRow[], probs: Map<string, StepInfo>) {
  type St = { code: string | null; name: string | null; times: number };
  const seen = new Map<string, { code: string; step: number; who: Map<string, St> }>();
  for (const x of ss) {
    const p = probs.get(x.problem_code);
    for (let i = 0; p && i < p.steps.length; i++) if ((x.struggled ?? 0) >> i & 1) {
      const k = `${x.problem_code}|${i}`;
      const e = seen.get(k) ?? seen.set(k, { code: x.problem_code, step: i + 1, who: new Map() }).get(k)!;
      const w = e.who.get(x.student_code ?? x.id) ?? { code: x.student_code, name: x.student_name ?? null, times: 0 };
      w.times++;
      e.who.set(x.student_code ?? x.id, w);
    }
  }
  return [...seen.values()].map((e) => ({ code: e.code, title: probs.get(e.code)!.title, step: e.step, label: label(probs.get(e.code)!, e.step - 1), n: e.who.size, students: [...e.who.values()].sort((a, b) => b.times - a.times) }))
    .sort((a, b) => b.n - a.n || a.code.localeCompare(b.code) || a.step - b.step);
}

// Cả lớp, theo học sinh: mỗi học sinh gặp khó ở những (đề, bước) nào, mấy phiên. Nhiều bước nhất trước.
export function hardStudents(ss: SRow[], probs: Map<string, StepInfo>) {
  type Stp = { code: string; step: number; label: string; times: number };
  const who = new Map<string, { code: string | null; name: string | null; steps: Map<string, Stp> }>();
  for (const x of ss) {
    const p = probs.get(x.problem_code);
    for (let i = 0; p && i < p.steps.length; i++) if ((x.struggled ?? 0) >> i & 1) {
      const key = x.student_code ?? x.id;
      const w = who.get(key) ?? who.set(key, { code: x.student_code, name: x.student_name ?? null, steps: new Map() }).get(key)!;
      const k = `${x.problem_code}|${i}`;
      const s = w.steps.get(k) ?? w.steps.set(k, { code: x.problem_code, step: i + 1, label: label(p, i), times: 0 }).get(k)!;
      s.times++;
    }
  }
  return [...who.values()].map((w) => {
    const steps = [...w.steps.values()].sort((a, b) => b.times - a.times || a.code.localeCompare(b.code) || a.step - b.step);
    return { code: w.code, name: w.name, steps, total: steps.reduce((n, s) => n + s.times, 0) };
  }).sort((a, b) => b.steps.length - a.steps.length || b.total - a.total);
}

// Một học sinh: mỗi (đề, bước) gặp khó mấy phiên, bị giải hộ mấy phiên, trên tổng số phiên làm đề đó. Bước giải hộ nhiều rồi gặp khó nhiều trước.
export function weakSteps(ss: SRow[], probs: Map<string, StepInfo>) {
  const total = new Map<string, number>();
  const out = new Map<string, { code: string; title: string; step: number; label: string; struggled: number; revealed: number; sessions: { id: string; started_at: string; helped: boolean }[] }>();
  for (const x of ss) {
    const p = probs.get(x.problem_code);
    if (!p) continue;
    total.set(x.problem_code, (total.get(x.problem_code) ?? 0) + 1);
    for (let i = 0; i < p.steps.length; i++) {
      const a = (x.struggled ?? 0) >> i & 1, b = (x.revealed ?? 0) >> i & 1;
      if (!a && !b) continue;
      const k = `${x.problem_code}|${i}`;
      const e = out.get(k) ?? out.set(k, { code: x.problem_code, title: p.title, step: i + 1, label: label(p, i), struggled: 0, revealed: 0, sessions: [] }).get(k)!;
      e.struggled += a | b; e.revealed += b;
      e.sessions.push({ id: x.id, started_at: x.started_at ?? "", helped: !!b });
    }
  }
  return [...out.values()].map((e) => ({ ...e, sessions: e.sessions.sort((a, b) => b.started_at.localeCompare(a.started_at)), of: total.get(e.code) ?? 0 })).sort((a, b) => b.revealed - a.revealed || b.struggled - a.struggled || a.code.localeCompare(b.code) || a.step - b.step);
}
