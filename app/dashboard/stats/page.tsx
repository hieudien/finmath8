import { supabaseServer } from "@/lib/supabase/server";
import { BarBox, LineBox } from "@/components/Charts";
import { Empty } from "@/components/ui";
import { check } from "@/lib/db";
import { compare, K_MIN, summarize, type Ev, type Sess } from "@/lib/stats";

type L = { id: string; label: string; tag: string | null };
const TAG: Record<string, string> = { pre: "Trước", post: "Sau", experiment: "Thực nghiệm", control: "Đối chứng" };

export default async function Page({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  const sb = await supabaseServer();
  const res = await Promise.all([
    sb.from("public_links").select("id,label,tag").order("created_at", { ascending: false }),
    sb.from("chat_sessions").select("id,link_id,seq,status,started_at,problem_code").order("seq"),
    sb.from("session_evals").select("*"),
    sb.from("link_visit_counts").select("link_id,n"),
  ]);
  res.forEach(check); // lỗi đọc dữ liệu thì hiện trang báo lỗi, không để trang hiện số 0 gây hiểu nhầm
  const [ln, ss, es, vs] = res.map((r) => r.data);
  const links = (ln ?? []) as L[];
  const sessions = (ss ?? []) as Sess[];
  const evals = (es ?? []) as Ev[];
  const visits = (vs ?? []) as { link_id: string; n: number }[];
  const per = (id: string) => {
    const s = sessions.filter((x) => x.link_id === id);
    const ids = new Set(s.map((x) => x.id));
    return { s, e: evals.filter((x) => ids.has(x.session_id)), v: visits.find((x) => x.link_id === id)?.n ?? 0 };
  };

  if (!links.length) return <div className="flex flex-col gap-6"><h1>Thống kê</h1><Empty text="Chưa có liên kết nào để thống kê." /></div>;

  const cur = links.find((l) => l.id === link);
  if (cur) {
    const { s, e, v } = per(cur.id);
    const m = summarize(s, e, v);
    // ponytail: tối đa 5000 tin gần nhất của liên kết này; phân trang khi lớp rất đông.
    const mres = s.length && m.enough ? await sb.from("messages").select("session_id,role,content,ts").in("session_id", s.map((x) => x.id)).order("id").limit(5000) : { data: [], error: null };
    check(mres);
    const msgs = (mres.data ?? []) as { session_id: string; role: "student" | "bot"; content: string; ts: string }[];
    const evBy = new Map(e.map((x) => [x.session_id, x]));
    return (
      <div className="flex flex-col gap-6">
        <div>
          <a href="/dashboard/stats" className="text-sm text-primary underline">Tất cả liên kết</a>
          <h1>{cur.label}</h1>
          <p className="text-text-muted">Học sinh ẩn danh: không lưu tên, lớp, IP. Mỗi phiên chỉ có số thứ tự.</p>
        </div>
        <Kpis items={[["Lượt mở", m.visits], ["Phiên chat", m.sessions], ["Hoàn thành", `${m.completion}%`], ["Điểm TB / 12", m.enough ? m.totalAvg : "—"]]} />
        {!m.enough ? (
          <p className="rounded-lg border border-border bg-surface p-4">Mới có {m.sessions} phiên. Cần ít nhất {K_MIN} phiên mới hiện chi tiết, để không đoán ra từng học sinh.</p>
        ) : (
          <>
            <Section title="Số phiên theo ngày"><LineBox data={m.daily} /></Section>
            <Section title="Điểm trung bình theo tiêu chí (0–3)"><BarBox data={m.rubric} max={3} /></Section>
            <Section title="Phân bố tổng điểm (0–12)"><BarBox data={m.totalDist} /></Section>
            <Section title="Mức gợi ý cao nhất đã dùng"><BarBox data={m.hintDist} /></Section>
            <Section title="Lỗi thường gặp"><BarBox data={m.errors} horizontal /></Section>
            <Kpis items={[["Đúng kết luận", `${m.correctPct}%`], ["Thời gian TB (phút)", m.durationMin], ["Lần tăng gợi ý TB", m.hintAvg], ["Hài lòng (1–5)", m.likertAvg == null ? "—" : `${m.likertAvg} (${m.likertN})`]]} />
            <Section title="Từng phiên (ẩn danh)">
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface md:hidden">
                {s.map((x) => { const ev = evBy.get(x.id); return (
                  <li key={x.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0"><span className="block font-medium">HS #{x.seq} · {x.problem_code}</span><span className="block text-sm text-text-muted tnum">{ev ? `Gợi ý tối đa mức ${ev.max_hint_level} · ${Math.round(ev.duration_s / 60)} phút` : "Chưa chấm"}</span></span>
                    <span className="shrink-0 text-right"><span className="tnum block font-bold">{ev ? `${ev.total}/12` : "—"}</span><span className="block whitespace-nowrap text-sm text-text-muted">{ev ? (ev.final_correct ? "Đúng" : "Chưa đúng") : x.status === "active" ? "Đang làm" : "Bỏ dở"}</span></span>
                  </li>); })}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead><tr className="border-b border-border-strong"><th className="py-2 pr-2">Học sinh</th><th className="pr-2">Bài</th><th className="pr-2">Điểm</th><th className="pr-2">Gợi ý tối đa</th><th className="pr-2">Phút</th><th>Kết quả</th></tr></thead>
                  <tbody className="tnum">
                    {s.map((x) => { const ev = evBy.get(x.id); return (
                      <tr key={x.id} className="border-b border-border">
                        <td className="py-2 pr-2">HS #{x.seq}</td><td className="pr-2">{x.problem_code}</td>
                        <td className="pr-2">{ev ? `${ev.total}/12` : "—"}</td><td className="pr-2">{ev ? `Mức ${ev.max_hint_level}` : "—"}</td>
                        <td className="pr-2">{ev ? Math.round(ev.duration_s / 60) : "—"}</td>
                        <td>{ev ? (ev.final_correct ? "Đúng" : "Chưa đúng") : x.status === "active" ? "Đang làm" : "Bỏ dở"}</td>
                      </tr>); })}
                  </tbody>
                </table>
              </div>
            </Section>
            <Section title="Hội thoại của học sinh (ẩn danh)">
              <p className="text-sm text-text-muted">Tin nhắn đã được che số điện thoại, email, tên. Bấm vào từng học sinh để xem.</p>
              <div className="flex flex-col gap-2">
                {s.map((x) => { const list = msgs.filter((m) => m.session_id === x.id); const ev = evBy.get(x.id); return (
                  <details key={x.id} className="rounded-sm border border-border bg-surface px-3">
                    <summary className="min-h-11 cursor-pointer py-2 font-medium">HS #{x.seq} · {x.problem_code} · {list.length} tin{ev ? ` · ${ev.total}/12` : ""}</summary>
                    <ul className="flex flex-col gap-2 pb-3">
                      {list.map((m, i) => (
                        <li key={i} className={`max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === "bot" ? "self-start border border-border" : "self-end bg-primary-soft"}`}>
                          <span className="block text-xs text-text-muted">{m.role === "bot" ? "Chatbot" : "Học sinh"} · {new Date(m.ts).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</span>
                          {m.content}
                        </li>
                      ))}
                      {list.length === 0 && <li className="text-sm text-text-muted">Chưa có tin nhắn.</li>}
                    </ul>
                  </details>); })}
              </div>
              <a href="/api/export?kind=chat" className="inline-flex min-h-11 items-center self-start rounded-sm border border-border-strong bg-surface px-4 font-medium hover:bg-primary-soft">Tải toàn bộ hội thoại (CSV)</a>
            </Section>
          </>
        )}
      </div>
    );
  }

  const byTag = (t: string) => links.filter((l) => l.tag === t).flatMap((l) => per(l.id).e.map((x) => x.total));
  const cmps = [["Trước (pre) so với Sau (post)", byTag("pre"), byTag("post")], ["Đối chứng so với Thực nghiệm", byTag("control"), byTag("experiment")]] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1>Thống kê</h1><a href="/api/export?kind=stats" className="inline-flex min-h-11 items-center rounded-sm border border-border-strong bg-surface px-4 font-medium hover:bg-primary-soft">Tải CSV</a></div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {links.map((l) => { const { s, e, v } = per(l.id); const m = summarize(s, e, v); return (
          <li key={l.id}>
            <a href={`/dashboard/stats?link=${l.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-primary-soft">
              <span className="font-medium">{l.label} {l.tag && <span className="text-sm font-normal text-text-muted">· {TAG[l.tag]}</span>}</span>
              <span className="tnum text-sm text-text-muted">{m.visits} lượt mở · {m.sessions} phiên · {m.completion}% xong · {m.enough ? `${m.totalAvg}/12` : "chưa đủ dữ liệu"}</span>
            </a>
          </li>); })}
      </ul>
      {cmps.map(([title, a, b]) => { const c = compare([...a], [...b]); return c && (
        <Section key={title} title={title}>
          <p className="tnum">{TAG[title.startsWith("Trước") ? "pre" : "control"]}: TB {c.meanA}, SD {c.sdA}, n={c.nA}. {TAG[title.startsWith("Trước") ? "post" : "experiment"]}: TB {c.meanB}, SD {c.sdB}, n={c.nB}. Thống kê t ≈ {c.t ?? "—"}.</p>
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
