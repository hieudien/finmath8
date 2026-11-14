import { fold } from "@/lib/search";
import type { supabaseServer } from "@/lib/supabase/server";

export type Sess = { id: string; link_id: string; seq: number; status: string; started_at: string; problem_code: string; student_code: string | null; student_name: string | null; student_class?: string | null; revealed?: number; struggled?: number };
export const bits = (n: number) => n.toString(2).replace(/0/g, "").length; // số bit 1 của mặt nạ (số bước được giải hộ)
// Khóa nội bộ của học sinh: tên bỏ dấu + lớp, in hoa. Cùng tên cùng lớp là một học sinh.
export const studentKey = (name: string, cls: string) => `${fold(name).replace(/[^a-z0-9]/g, "").toUpperCase()}.${cls.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`;
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

// Phiên gặp khó = học sinh bấm Gợi ý, Em chưa hiểu, nộp sai hoặc được giải hộ (struggled hoặc revealed khác 0). Tính theo đề, không theo bước:
// học sinh không thấy bước nên không có "bước nào" để gặp khó; đề nào khó thì lời giải và sai lầm thường gặp của đề đó nói lên chỗ khó.
export type ProbInfo = { title: string };
type SRow = { id: string; problem_code: string; student_code: string | null; student_name?: string | null; struggled?: number; revealed?: number; started_at?: string };
const hit = (x: SRow) => ((x.struggled ?? 0) | (x.revealed ?? 0)) !== 0;

// Cả lớp: đếm số học sinh (không phải số phiên) gặp khó ở từng đề, kèm danh sách học sinh. Nhiều nhất trước.
export function hardProblems(ss: SRow[], probs: Map<string, ProbInfo>) {
  type St = { code: string | null; name: string | null; times: number };
  const seen = new Map<string, Map<string, St>>();
  for (const x of ss) {
    if (!probs.has(x.problem_code) || !hit(x)) continue;
    const who = seen.get(x.problem_code) ?? seen.set(x.problem_code, new Map()).get(x.problem_code)!;
    const w = who.get(x.student_code ?? x.id) ?? { code: x.student_code, name: x.student_name ?? null, times: 0 };
    w.times++;
    who.set(x.student_code ?? x.id, w);
  }
  return [...seen].map(([code, who]) => ({ code, title: probs.get(code)!.title, n: who.size, students: [...who.values()].sort((a, b) => b.times - a.times) }))
    .sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
}

// Cả lớp, theo học sinh: mỗi học sinh gặp khó ở những đề nào, mấy phiên. Nhiều đề nhất trước.
export function hardStudents(ss: SRow[], probs: Map<string, ProbInfo>) {
  type Pr = { code: string; title: string; times: number };
  const who = new Map<string, { code: string | null; name: string | null; problems: Map<string, Pr> }>();
  for (const x of ss) {
    const p = probs.get(x.problem_code);
    if (!p || !hit(x)) continue;
    const key = x.student_code ?? x.id;
    const w = who.get(key) ?? who.set(key, { code: x.student_code, name: x.student_name ?? null, problems: new Map() }).get(key)!;
    const e = w.problems.get(x.problem_code) ?? w.problems.set(x.problem_code, { code: x.problem_code, title: p.title, times: 0 }).get(x.problem_code)!;
    e.times++;
  }
  return [...who.values()].map((w) => {
    const problems = [...w.problems.values()].sort((a, b) => b.times - a.times || a.code.localeCompare(b.code));
    return { code: w.code, name: w.name, problems, total: problems.reduce((n, s) => n + s.times, 0) };
  }).sort((a, b) => b.problems.length - a.problems.length || b.total - a.total);
}

// Một học sinh: mỗi đề gặp khó mấy phiên, bị giải hộ mấy phiên, trên tổng số phiên làm đề đó. Giải hộ nhiều rồi gặp khó nhiều trước.
export function weakProblems(ss: SRow[], probs: Map<string, ProbInfo>) {
  const total = new Map<string, number>();
  const out = new Map<string, { code: string; title: string; struggled: number; revealed: number; sessions: { id: string; started_at: string; helped: boolean }[] }>();
  for (const x of ss) {
    const p = probs.get(x.problem_code);
    if (!p) continue;
    total.set(x.problem_code, (total.get(x.problem_code) ?? 0) + 1);
    if (!hit(x)) continue;
    const helped = (x.revealed ?? 0) !== 0;
    const e = out.get(x.problem_code) ?? out.set(x.problem_code, { code: x.problem_code, title: p.title, struggled: 0, revealed: 0, sessions: [] }).get(x.problem_code)!;
    e.struggled++;
    if (helped) e.revealed++;
    e.sessions.push({ id: x.id, started_at: x.started_at ?? "", helped });
  }
  return [...out.values()].map((e) => ({ ...e, sessions: e.sessions.sort((a, b) => b.started_at.localeCompare(a.started_at)), of: total.get(e.code) ?? 0 })).sort((a, b) => b.revealed - a.revealed || b.struggled - a.struggled || a.code.localeCompare(b.code));
}
