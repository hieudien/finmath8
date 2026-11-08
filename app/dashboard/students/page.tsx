import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { check } from "@/lib/db";
import { Empty } from "@/components/ui";
import { CRITERIA } from "@/lib/students";
import { r1 } from "@/lib/stats";

type S = { student_code: string; names: string[]; sessions: number; evaluated: number; identify: number; plan: number; calculate: number; explain: number; total_avg: number; correct_pct: number; hint_avg: number; last_at: string };

export default async function Page() {
  const r = await (await supabaseServer()).from("student_stats").select("*").order("last_at", { ascending: false }).limit(500);
  check(r);
  const rows = (r.data ?? []) as S[];
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  return (
    <div className="flex flex-col gap-6">
      <h1>Học sinh</h1>
      <p className="text-text-muted">Gom theo mã học sinh tự nhập. Bấm vào một học sinh để xem điểm yếu và đề xuất cải thiện.</p>
      {rows.length === 0 ? <Empty text="Chưa có học sinh nào làm bài qua liên kết." /> : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {rows.map((s) => {
            const weak = s.evaluated ? [...CRITERIA].sort((a, b) => s[a[0]] - s[b[0]])[0][1] : null;
            return (
              <li key={s.student_code}>
                <Link href={`/dashboard/students/${encodeURIComponent(s.student_code)}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-primary-soft">
                  <span className="min-w-0"><span className="block font-medium">{s.names.join(" / ")} <span className="tnum font-normal text-text-muted">({s.student_code})</span></span>
                    <span className="block text-sm text-text-muted">{weak ? `Yếu nhất: ${weak}` : "Chưa có bài được chấm"} · lần cuối {fmt.format(new Date(s.last_at))}</span></span>
                  <span className="tnum text-sm text-text-muted">{s.sessions} phiên · {s.evaluated ? `${r1(s.total_avg)}/12 · ${Math.round(s.correct_pct)}% đúng · ${r1(s.hint_avg)} gợi ý` : "—"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
