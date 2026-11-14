import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { check } from "@/lib/db";
import { Empty } from "@/components/ui";
import { CRITERIA } from "@/lib/students";
import { avgTen } from "@/lib/score";
import { r1, weakProblems, type ProbInfo } from "@/lib/stats";

type S = { student_code: string; names: string[]; sessions: number; evaluated: number; identify: number; plan: number; calculate: number; explain: number; total_avg: number; correct_pct: number; hint_avg: number; last_at: string; student_class: string | null };

export default async function Page() {
  const sb = await supabaseServer();
  const [r, hs, pr] = await Promise.all([
    sb.from("student_stats").select("*").order("last_at", { ascending: false }).limit(500),
    sb.from("chat_sessions").select("problem_code,student_code,struggled,revealed").not("student_code", "is", null).gt("struggled", 0).order("started_at", { ascending: false }).limit(2000), // chỉ phiên có bước gặp khó
    sb.from("problems").select("code,title:content->>title").is("deleted_at", null),
  ]);
  check(r);
  const rows = (r.data ?? []) as S[];
  // Đề hay vướng nhất của từng học sinh (lỗi đọc thì bỏ dòng này, không làm hỏng danh sách).
  const info = new Map<string, ProbInfo>(((pr.data ?? []) as { code: string; title: string | null }[]).map((x) => [x.code, { title: x.title ?? x.code }]));
  const by = new Map<string, { id: string; problem_code: string; student_code: string; struggled: number; revealed: number }[]>();
  for (const [i, x] of ((hs.data ?? []) as { problem_code: string; student_code: string; struggled: number; revealed: number }[]).entries()) (by.get(x.student_code) ?? by.set(x.student_code, []).get(x.student_code)!).push({ ...x, id: String(i) });
  const hard = (code: string) => weakProblems(by.get(code) ?? [], info)[0];
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  return (
    <div className="flex flex-col gap-6">
      <h1>Học sinh</h1>
      <p className="text-text-muted">Gom theo tên và lớp học sinh tự nhập. Bấm vào một học sinh để xem điểm yếu và đề xuất cải thiện.</p>
      {rows.length === 0 ? <Empty text="Chưa có học sinh nào làm bài qua liên kết." /> : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {rows.map((s) => {
            const weak = s.evaluated ? [...CRITERIA].sort((a, b) => s[a[0]] - s[b[0]])[0][1] : null;
            const h = hard(s.student_code);
            return (
              <li key={s.student_code}>
                <Link href={`/dashboard/students/${encodeURIComponent(s.student_code)}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-primary-soft">
                  <span className="min-w-0"><span className="block font-medium">{s.names.join(" / ")} <span className="tnum font-normal text-text-muted">({s.student_class || s.student_code})</span></span>
                    <span className="block text-sm text-text-muted">{weak ? `Yếu nhất: ${weak}` : "Chưa có bài được chấm"} · lần cuối {fmt.format(new Date(s.last_at))}</span>
                    {h && <span className="block text-sm text-text-muted">Hay vướng: {h.title}</span>}</span>
                  <span className="tnum text-sm text-text-muted">{s.sessions} phiên · {s.evaluated ? `${avgTen(s.total_avg)}/10 · ${Math.round(s.correct_pct)}% đúng · ${r1(s.hint_avg)} gợi ý` : "—"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
