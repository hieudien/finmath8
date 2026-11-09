import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
// import { BarBox, LineBox } from "@/components/ChartsLazy"; // bỏ comment cùng 5 biểu đồ đang ẩn
import ChatLog from "@/components/ChatLog";
import "katex/dist/katex.min.css";
import { Empty } from "@/components/ui";
import { check } from "@/lib/db";
import { shortId } from "@/lib/sid";
import { bits, compareStats, r1, who, type Ev, type Sess, type Summary } from "@/lib/stats";

const helped = (x: Sess) => (x.revealed ? ` · giải hộ ${bits(x.revealed)} bước` : ""); // bước bot đã hiện lời giải vì học sinh kẹt: không tính là tự làm

type L = { id: string; label: string; tag: string | null };
type LS = { link_id: string; sessions: number; done: number; total_avg: number; visits: number };
type TS = { tag: string; n: number; mean: number; sd_pop: number; var_samp: number };
const RECENT = 100;
const TAG: Record<string, string> = { pre: "Trước", post: "Sau", experiment: "Thực nghiệm", control: "Đối chứng" };

export default async function Page({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  const sb = await supabaseServer();
  // Số liệu gom sẵn trong DB (view link_stats, hàm link_summary): PostgREST cắt 1000 dòng nên không tính ở phía app.
  // Mở 1 liên kết chỉ tải danh sách 100 phiên gần nhất để hiện bảng và hội thoại.
  const res = await Promise.all([
    sb.from("public_links").select("id,label,tag").order("created_at", { ascending: false }),
    sb.from("link_stats").select("*"),
    link ? sb.from("chat_sessions").select("id,link_id,seq,status,started_at,problem_code,student_code,student_name,revealed").eq("link_id", link).order("seq", { ascending: false }).limit(RECENT) : null,
    link ? sb.rpc("link_summary", { p_link: link } as never) : null,
    link ? null : sb.from("tag_stats").select("*"),
  ]);
  res.forEach((r) => r && check(r)); // lỗi đọc dữ liệu thì hiện trang báo lỗi, không để trang hiện số 0 gây hiểu nhầm
  const links = (res[0].data ?? []) as L[];
  const stats = new Map(((res[1].data ?? []) as LS[]).map((x) => [x.link_id, x]));
  const sessions = (res[2]?.data ?? []) as Sess[];
  const summary = res[3]?.data as Summary | undefined;
  const evals = sessions.length ? (((await sb.from("session_evals").select("*").in("session_id", sessions.map((x) => x.id))).data ?? []) as Ev[]) : [];
  const tags = new Map(((res[4]?.data ?? []) as TS[]).map((x) => [x.tag, { n: x.n, mean: x.mean, sd: x.sd_pop, v: x.var_samp }]));

  if (!links.length) return <div className="flex flex-col gap-6"><h1>Thống kê</h1><Empty text="Chưa có liên kết nào để thống kê." /></div>;

  const cur = links.find((l) => l.id === link);
  if (cur && summary) {
    const s = sessions, e = evals;
    const m = { ...summary, visits: stats.get(cur.id)?.visits ?? 0, enough: summary.sessions > 0, completion: summary.sessions ? Math.round((summary.done / summary.sessions) * 100) : 0 };
    const evBy = new Map(e.map((x) => [x.session_id, x]));
    return (
      <div className="flex flex-col gap-6">
        <div>
          <a href="/dashboard/stats" className="text-sm text-primary underline">Tất cả liên kết</a>
          <h1>{cur.label}</h1>
          <p className="text-text-muted">Mỗi phiên gắn với mã và tên học sinh tự nhập. Xem từng học sinh ở mục <Link href="/dashboard/students" className="text-primary underline">Học sinh</Link>.</p>
        </div>
        <Kpis items={[["Lượt mở", m.visits], ["Phiên chat", m.sessions], ["Hoàn thành", `${m.completion}%`], ["Điểm TB / 12", m.enough ? m.totalAvg : "—"]]} />
        {!m.enough ? (
          <p className="rounded-lg border border-border bg-surface p-4">Chưa có phiên chat nào. Số liệu sẽ hiện khi học sinh bắt đầu làm bài.</p>
        ) : (
          <>
            {/* Tạm ẩn 5 biểu đồ; bỏ comment để hiện lại:
            <Section title="Số phiên theo ngày"><LineBox data={m.daily} /></Section>
            <Section title="Điểm trung bình theo tiêu chí (0–3)"><BarBox data={m.rubric} max={3} /></Section>
            <Section title="Phân bố tổng điểm (0–12)"><BarBox data={m.totalDist} /></Section>
            <Section title="Mức gợi ý cao nhất đã dùng"><BarBox data={m.hintDist} /></Section>
            <Section title="Lỗi thường gặp"><BarBox data={m.errors} horizontal /></Section>
            */}
            <Kpis items={[["Đúng kết luận", `${m.correctPct}%`], ["Thời gian TB (phút)", m.durationMin], ["Lần tăng gợi ý TB", m.hintAvg], ["Hài lòng (1–5)", m.likertAvg == null ? "—" : `${m.likertAvg} (${m.likertN})`]]} />
            <Section title={`Từng phiên (${s.length}/${m.sessions} phiên gần nhất)`}>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface md:hidden">
                {s.map((x) => { const ev = evBy.get(x.id); return (
                  <li key={x.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0"><span className="block font-medium">{who(x)} · {x.problem_code}</span><span className="block text-sm text-text-muted tnum">{ev ? `Gợi ý tối đa mức ${ev.max_hint_level} · ${Math.round(ev.duration_s / 60)} phút${ev.confidence ? ` · Tự thấy hiểu ${ev.confidence}/5` : ""}` : "Chưa chấm"} · Mã <span className="font-mono">{shortId(x.id)}</span></span></span>
                    <span className="shrink-0 text-right"><span className="tnum block font-bold">{ev ? `${ev.total}/12` : "—"}</span><span className="block whitespace-nowrap text-sm text-text-muted">{ev ? (ev.final_correct ? "Đúng" : "Chưa đúng") : x.status === "active" ? "Đang làm" : "Bỏ dở"}{helped(x)}</span></span>
                  </li>); })}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead><tr className="border-b border-border-strong"><th className="py-2 pr-2">Mã phiên</th><th className="pr-2">Học sinh</th><th className="pr-2">Bài</th><th className="pr-2">Điểm</th><th className="pr-2">Gợi ý tối đa</th><th className="pr-2">Phút</th><th>Kết quả</th></tr></thead>
                  <tbody className="tnum">
                    {s.map((x) => { const ev = evBy.get(x.id); return (
                      <tr key={x.id} className="border-b border-border">
                        <td className="py-2 pr-2 font-mono">{shortId(x.id)}</td><td className="pr-2">{who(x)}</td><td className="pr-2">{x.problem_code}</td>
                        <td className="pr-2">{ev ? `${ev.total}/12` : "—"}</td><td className="pr-2">{ev ? `Mức ${ev.max_hint_level}` : "—"}</td>
                        <td className="pr-2">{ev ? Math.round(ev.duration_s / 60) : "—"}</td>
                        <td>{ev ? (ev.final_correct ? "Đúng" : "Chưa đúng") : x.status === "active" ? "Đang làm" : "Bỏ dở"}{helped(x)}</td>
                      </tr>); })}
                  </tbody>
                </table>
              </div>
            </Section>
            <Section title="Hội thoại của học sinh">
              <p className="text-sm text-text-muted">Tin nhắn đã được che số điện thoại và email. Bấm vào từng học sinh để xem.</p>
              <div className="flex flex-col gap-2">
                {s.map((x) => { const ev = evBy.get(x.id); return <ChatLog key={x.id} id={x.id} title={`${shortId(x.id)} · ${who(x)} · ${x.problem_code}${ev ? ` · ${ev.total}/12` : ""}`} />; })}
              </div>
              <a href="/api/export?kind=chat" className="inline-flex min-h-11 items-center self-start rounded-sm border border-border-strong bg-surface px-4 font-medium hover:bg-primary-soft">Tải toàn bộ hội thoại (CSV)</a>
            </Section>
          </>
        )}
      </div>
    );
  }

  const cmps = [["Trước (pre) so với Sau (post)", "pre", "post"], ["Đối chứng so với Thực nghiệm", "control", "experiment"]] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1>Thống kê</h1><a href="/api/export?kind=stats" className="inline-flex min-h-11 items-center rounded-sm border border-border-strong bg-surface px-4 font-medium hover:bg-primary-soft">Tải CSV</a></div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {links.map((l) => { const x = stats.get(l.id); const n = x?.sessions ?? 0; return (
          <li key={l.id}>
            <a href={`/dashboard/stats?link=${l.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-primary-soft">
              <span className="font-medium">{l.label} {l.tag && <span className="text-sm font-normal text-text-muted">· {TAG[l.tag]}</span>}</span>
              <span className="tnum text-sm text-text-muted">{x?.visits ?? 0} lượt mở · {n} phiên · {n ? Math.round(((x?.done ?? 0) / n) * 100) : 0}% xong · {n ? `${r1(x?.total_avg ?? 0)}/12` : "chưa đủ dữ liệu"}</span>
            </a>
          </li>); })}
      </ul>
      {cmps.map(([title, ta, tb]) => { const c = compareStats(tags.get(ta), tags.get(tb)); return c && (
        <Section key={title} title={title}>
          <p className="tnum">{TAG[ta]}: TB {c.meanA}, SD {c.sdA}, n={c.nA}. {TAG[tb]}: TB {c.meanB}, SD {c.sdB}, n={c.nB}. Thống kê t ≈ {c.t ?? "—"}.</p>
          <p className="text-sm text-text-muted">t là ước lượng sơ bộ (hai mẫu độc lập). Mẫu nhỏ thì dùng Mann-Whitney khi báo cáo chính thức.</p>
        </Section>); })}
    </div>
  );
}

function Kpis({ items }: { items: [string, string | number][] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map(([k, v]) => <div key={k}><dt className="text-sm text-text-muted">{k}</dt><dd className="tnum text-2xl font-bold">{v}</dd></div>)}
    </dl>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-2 border-t border-border pt-4"><h2>{title}</h2>{children}</section>;
}
