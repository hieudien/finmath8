import type { supabaseServer } from "@/lib/supabase/server";

type Sb = Awaited<ReturnType<typeof supabaseServer>>;

export const CRITERIA = [["identify", "Nhận diện"], ["plan", "Lập kế hoạch"], ["calculate", "Tính toán"], ["explain", "Giải thích"]] as const;

export type Attempt = {
  id: string; problem_code: string; title: string; status: string; started_at: string;
  ev: { identify: number; plan: number; calculate: number; explain: number; total: number; final_correct: boolean; hint_count: number; errors: string[] } | null;
};
export type Profile = {
  code: string; names: string[]; attempts: Attempt[];
  rubric: { key: string; name: string; value: number }[]; // trung bình 0..3, yếu nhất đứng đầu
  errors: { name: string; value: number }[];
  weakSkills: { name: string; value: number }[]; // kỹ năng của các bài làm chưa tốt (tổng < 8/12 hoặc chưa đúng)
  evaluated: number;
};

const arr = <T>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const top = (m: Map<string, number>) => [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

// RLS của supabaseServer giới hạn: giáo viên chỉ đọc được học sinh của mình.
export async function loadStudent(sb: Sb, code: string): Promise<Profile | null> {
  const [s, p] = await Promise.all([
    sb.from("chat_sessions").select("id,problem_code,status,started_at,student_name,session_evals(identify,plan,calculate,explain,total,final_correct,hint_count,errors)").eq("student_code", code).order("started_at", { ascending: false }).limit(200),
    sb.from("problems").select("code,content").is("deleted_at", null),
  ]);
  if (s.error) throw new Error("Lỗi cơ sở dữ liệu: " + s.error.message);
  type SR = { id: string; problem_code: string; status: string; started_at: string; student_name: string | null; session_evals: Attempt["ev"] | Attempt["ev"][] | null };
  const rows = (s.data ?? []) as SR[];
  if (!rows.length) return null;
  const prob = new Map(((p.data ?? []) as { code: string; content: { title?: string; skills?: string[] } }[]).map((x) => [x.code, x.content]));
  const attempts = rows.map((r) => ({ id: r.id, problem_code: r.problem_code, title: prob.get(r.problem_code)?.title ?? r.problem_code, status: r.status, started_at: r.started_at, ev: arr(r.session_evals)[0] ?? null }));
  const done = attempts.filter((a) => a.ev);
  const rubric = CRITERIA.map(([key, name]) => ({ key, name, value: done.length ? done.reduce((n, a) => n + (a.ev as never as Record<string, number>)[key], 0) / done.length : 0 })).sort((a, b) => a.value - b.value);
  const errors = new Map<string, number>(), skills = new Map<string, number>();
  for (const a of done) {
    a.ev!.errors.forEach((e) => errors.set(e, (errors.get(e) ?? 0) + 1));
    if (a.ev!.total < 8 || !a.ev!.final_correct) (prob.get(a.problem_code)?.skills ?? []).forEach((k) => skills.set(k, (skills.get(k) ?? 0) + 1));
  }
  return { code, names: [...new Set(rows.map((r) => r.student_name).filter((x): x is string => !!x))], attempts, rubric, errors: top(errors), weakSkills: top(skills), evaluated: done.length };
}
