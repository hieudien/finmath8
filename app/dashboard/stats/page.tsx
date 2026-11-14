import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
// import { BarBox, LineBox } from "@/components/ChartsLazy"; // bỏ comment cùng 5 biểu đồ đang ẩn
import ChatLog from "@/components/ChatLog";
import "katex/dist/katex.min.css";
import { Badge, Empty, ScoreBadge, StatusBadge } from "@/components/ui";
import { check } from "@/lib/db";
import { avgTen } from "@/lib/score"; // khi bỏ comment biểu đồ: thêm critTen, bandsTen
import { sweep } from "@/lib/sweep";
import { shortId } from "@/lib/sid";
import { bits, compareStats, fmtTime, hardStudents, P_STATE, sessionState, studentMsgs, who, type Ev, type ProblemStat, type Sess, type ProbInfo, type Summary } from "@/lib/stats";

const helpedN = (x: Sess) => (x.revealed ? bits(x.revealed) : 0); // số bước bot đã hiện lời giải vì học sinh kẹt: không tính là tự làm
const Helped = ({ x }: { x: Sess }) => helpedN(x) > 0 ? <Badge tone="warn">Giải hộ {helpedN(x)} bước</Badge> : null;

type L = { id: string; label: string; tag: string | null };
type LS = { link_id: string; sessions: number; done: number; total_avg: number; visits: number };
type TS = { tag: string; n: number; mean: number; sd_pop: number; var_samp: number };
type Tok = { calls: number; input: number; output: number; thoughts: number };
type PU = Tok & { problem: string; kind: "prep" | "session"; sessions: number };
type SU = Tok & { session_id: string };
const nf = new Intl.NumberFormat("vi-VN");
const tokTotal = (t: Tok) => t.input + t.output + t.thoughts;
const trio = (t: Tok) => `${nf.format(Math.round(t.input))} / ${nf.format(Math.round(t.output))} / ${nf.format(Math.round(t.thoughts))}`; // in / out / thoughts
const RECENT = 100;
const NO_TOK: Tok = { calls: 0, input: 0, output: 0, thoughts: 0 };
const TAG: Record<string, string> = { pre: "Trước", post: "Sau", experiment: "Thực nghiệm", control: "Đối chứng" };

export default async function Page({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  const sb = await supabaseServer();
  sweep();
  // Số liệu gom sẵn trong DB (view link_stats, hàm link_summary): PostgREST cắt 1000 dòng nên không tính ở phía app.
  // Mở 1 liên kết chỉ tải danh sách 100 phiên gần nhất để hiện bảng và hội thoại.
  const res = await Promise.all([
    sb.from("public_links").select("id,label,tag").order("created_at", { ascending: false }),
    sb.from("link_stats").select("*"),
    link ? sb.from("chat_sessions").select("id,link_id,seq,status,started_at,problem_code,student_code,student_name,student_class,revealed,struggled").eq("link_id", link).order("seq", { ascending: false }).limit(RECENT) : null,
    link ? sb.rpc("link_summary", { p_link: link } as never) : null,
    link ? null : sb.from("tag_stats").select("*"),
    link ? sb.rpc("link_problem_stats", { p_link: link } as never) : null,
    link ? sb.from("public_links").select("problems_snapshot").eq("id", link).maybeSingle() : null,
  ]);
  res.forEach((r) => r && check(r)); // lỗi đọc dữ liệu thì hiện trang báo lỗi, không để trang hiện số 0 gây hiểu nhầm
  const links = (res[0].data ?? []) as L[];
  const stats = new Map(((res[1].data ?? []) as LS[]).map((x) => [x.link_id, x]));
  const sessions = (res[2]?.data ?? []) as Sess[];
  const summary = res[3]?.data as Summary | undefined;
  const evals = sessions.length ? (((await sb.from("session_evals").select("*").in("session_id", sessions.map((x) => x.id))).data ?? []) as Ev[]) : [];
  // Mọi đề của liên kết (kể cả đề chưa ai làm) theo thứ tự trong liên kết, kèm học sinh và trạng thái từng em.
  const pStats = new Map(((res[5]?.data ?? []) as ProblemStat[]).map((x) => [x.code, x.students]));
  const snap = ((res[6]?.data as { problems_snapshot: { id: string; title?: string }[] } | null)?.problems_snapshot ?? []);
  const byProblem = [...snap.map((p) => ({ code: p.id, title: p.title ?? p.id })), ...[...pStats.keys()].filter((c) => !snap.some((p) => p.id === c)).map((c) => ({ code: c, title: c }))]
    .map((p) => ({ ...p, students: pStats.get(p.code) ?? [] }));
  // Token AI từ lúc ghi kèm đề và phiên (dòng cũ không có nên không tính). Số phiên và token đề tính trên mọi liên kết của giáo viên.
  const codes0 = byProblem.map((p) => p.code);
  const [puRes, suRes] = await Promise.all([
    codes0.length ? sb.rpc("ai_usage_by_problem", { days: 3650 } as never).in("problem", codes0) : null,
    sessions.length ? sb.rpc("ai_usage_by_session", { days: 3650 } as never).in("session_id", sessions.map((x) => x.id)) : null,
  ]);
  [puRes, suRes].forEach((r) => r && check(r));
  const puAll = (puRes?.data ?? []) as unknown as PU[];
  const puOf = (code: string, kind: PU["kind"]) => puAll.find((r) => r.problem === code && r.kind === kind);
  const suBy = new Map(((suRes?.data ?? []) as unknown as SU[]).map((r) => [r.session_id, r]));
  const tags = new Map(((res[4]?.data ?? []) as TS[]).map((x) => [x.tag, { n: x.n, mean: x.mean, sd: x.sd_pop, v: x.var_samp }]));

  if (!links.length) return <div className="flex flex-col gap-6"><h1>Thống kê</h1><Empty text="Chưa có liên kết nào để thống kê." /></div>;

  const cur = links.find((l) => l.id === link);
  if (cur && summary) {
    const s = sessions, e = evals;
    const m = { ...summary, enough: summary.sessions > 0 };
    const evBy = new Map(e.map((x) => [x.session_id, x]));
    const msgs = await studentMsgs(sb, s.map((x) => x.id));
    const stateOf = (x: Sess) => sessionState(x, evBy.get(x.id), msgs.get(x.id));
    const codes = [...new Set(s.filter((x) => x.struggled).map((x) => x.problem_code))];
    const pr = codes.length ? (((await sb.from("problems").select("code,content").in("code", codes).is("deleted_at", null)).data ?? []) as { code: string; content: { title?: string } }[]) : [];
    const probs = new Map<string, ProbInfo>(pr.map((r) => [r.code, { title: r.content.title ?? r.code }]));
    const hard = hardStudents(s, probs);
    return (
      <div className="flex flex-col gap-6">
        <div>
          <a href="/dashboard/stats" className="text-sm text-primary underline">Tất cả liên kết</a>
          <h1>{cur.label}</h1>
          <p className="text-text-muted">Mỗi phiên gắn với mã và tên học sinh tự nhập. Xem từng học sinh ở mục <Link href="/dashboard/students" className="text-primary underline">Học sinh</Link>.</p>
        </div>
        <Kpis items={[["Điểm TB / 10", m.enough ? avgTen(m.totalAvg) : "—"], ["Thời gian TB (phút)", m.enough ? m.durationMin : "—"]]} />
        {!m.enough ? (
          <p className="rounded-lg border border-border bg-surface p-4">Chưa có phiên chat nào. Số liệu sẽ hiện khi học sinh bắt đầu làm bài.</p>
        ) : (
          <>
            {/* Tạm ẩn 5 biểu đồ; bỏ comment để hiện lại:
            <Section title="Số phiên theo ngày"><LineBox data={m.daily} /></Section>
            <Section title="Điểm trung bình theo tiêu chí (thang 10)"><BarBox data={m.rubric.map((b) => ({ ...b, value: critTen(b.value) }))} max={10} /></Section>
            <Section title="Phân bố tổng điểm (thang 10)"><BarBox data={bandsTen(m.totalDist)} /></Section>
            <Section title="Mức gợi ý cao nhất đã dùng"><BarBox data={m.hintDist} /></Section>
            <Section title="Lỗi thường gặp"><BarBox data={m.errors} horizontal /></Section>
            */}
            <Section title="Học sinh làm được từng bài">
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
                {byProblem.map((p) => { const ok = p.students.filter((x) => x.state === "ok").length, n = p.students.length; return (
                  <li key={p.code}>
                    <details className="group">
                      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-primary-soft">
                        <span className="min-w-0 font-medium"><Badge tone="info">{p.code}</Badge> {p.title !== p.code && p.title}</span>
                        <span className="tnum font-semibold">{ok}/{n} học sinh tự làm được <span className="text-text-muted group-open:hidden">▾</span><span className="hidden text-text-muted group-open:inline">▴</span></span>
                      </summary>
                      {n ? (
                        <ul className="flex flex-col gap-1 border-t border-border px-4 py-2 text-sm">
                          {p.students.map((x, i) => (
                            <li key={x.code ?? `anon-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                              <span className="min-w-0">{x.code ? `${x.name ?? "Học sinh"}${x.class ? ` (${x.class})` : ""}` : "Ẩn danh (cũ)"}</span>
                              <span className="flex flex-wrap items-center gap-2"><span className="tnum text-text-muted">{x.sessions} phiên</span><Badge tone={P_STATE[x.state].tone}>{P_STATE[x.state].text}</Badge>{x.code && <Link href={`/dashboard/students/${encodeURIComponent(x.code)}`} className="text-primary underline">Hồ sơ</Link>}</span>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="border-t border-border px-4 py-2 text-sm text-text-muted">Chưa học sinh nào làm đề này.</p>}
                    </details>
                  </li>); })}
              </ul>
              <p className="text-sm text-text-muted">Tự làm được: có ít nhất một lần nộp đúng mà bot không giải hộ bước nào. Mỗi học sinh tính một lần dù làm nhiều phiên.</p>
            </Section>
            <Section title="Token AI theo đề">
              {puAll.length ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] text-left text-sm">
                      <thead><tr className="border-b border-border-strong"><th className="py-2 pr-2">Đề</th><th className="pr-2">Chuẩn bị đề</th><th className="pr-2">Số phiên</th><th className="pr-2">Trung bình mỗi phiên</th><th className="pr-2">Tổng các phiên</th><th>Tổng đề</th></tr></thead>
                      <tbody className="tnum">
                        {byProblem.filter((p) => puOf(p.code, "prep") || puOf(p.code, "session")).map((p) => {
                          const prep = puOf(p.code, "prep") ?? NO_TOK, ses = puOf(p.code, "session"), n = ses?.sessions ?? 0, sum = ses ?? NO_TOK;
                          const avg = n ? { ...NO_TOK, input: sum.input / n, output: sum.output / n, thoughts: sum.thoughts / n } : null;
                          const all = { ...NO_TOK, input: prep.input + sum.input, output: prep.output + sum.output, thoughts: prep.thoughts + sum.thoughts };
                          return (
                            <tr key={p.code} className="border-b border-border">
                              <td className="py-2 pr-2"><Badge tone="info">{p.code}</Badge></td>
                              <td className="pr-2">{prep.calls ? trio(prep) : "—"}</td>
                              <td className="pr-2">{n}</td>
                              <td className="pr-2">{avg ? trio(avg) : "—"}</td>
                              <td className="pr-2">{n ? trio(sum) : "—"}</td>
                              <td className="font-semibold">{nf.format(Math.round(tokTotal(all)))}</td>
                            </tr>);
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-sm text-text-muted">Mỗi ô là in / out / thoughts (token). Tổng đề gồm chuẩn bị đề (chuẩn hóa, kiểm đáp án, phân loại, viết lời giải) và mọi phiên làm bài, cộng cả in, out và thoughts. Số phiên và token của đề tính trên mọi liên kết của bạn. Chỉ tính từ lúc hệ thống bắt đầu ghi theo đề; token chuẩn bị của đề mới đang nạp hoặc tạo hàng loạt chưa gắn được vào đề nào.</p>
                </>
              ) : <p className="text-text-muted">Chưa có số liệu token theo đề. Số liệu hiện khi có lượt gọi AI mới của đề.</p>}
            </Section>
            <Section title="Đề học sinh hay gặp khó">
              {hard.length ? (
                <>
                  <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
                    {hard.map((h, hi) => (
                      <li key={h.code ?? `anon-${hi}`}>
                        <details className="group">
                          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-primary-soft">
                            <span className="min-w-0 font-medium">{h.code ? `${h.name ?? "Học sinh"} (${h.code})` : "Ẩn danh (cũ)"}</span>
                            <span className="tnum font-semibold">{h.problems.length} đề <span className="text-text-muted group-open:hidden">▾</span><span className="hidden text-text-muted group-open:inline">▴</span></span>
                          </summary>
                          <ul className="flex flex-col gap-1 border-t border-border px-4 py-2 text-sm">
                            {h.problems.map((s) => (
                              <li key={s.code} className="flex flex-wrap items-center justify-between gap-2">
                                <span className="min-w-0"><Badge tone="info">{s.code}</Badge> <span className="font-medium">{s.title}</span></span>
                                <span className="tnum text-text-muted">{s.times} phiên</span>
                              </li>
                            ))}
                            {h.code && <li><Link href={`/dashboard/students/${encodeURIComponent(h.code)}`} className="text-primary underline">Xem hồ sơ</Link></li>}
                          </ul>
                        </details>
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-text-muted">Tính khi học sinh bấm Gợi ý, bấm Em chưa hiểu, nộp sai hoặc được giải hộ ở bước đó. Chỉ tính trong các phiên gần nhất bên dưới. Bước là bước của lời giải chi tiết trong đề (học sinh không thấy số thứ tự này).</p>
                </>
              ) : <p className="text-text-muted">Chưa có học sinh nào gặp khó ở một đề cụ thể.</p>}
            </Section>
            <Section title={`Từng phiên (${s.length}/${m.sessions} phiên gần nhất)`}>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface md:hidden">
                {s.map((x) => { const ev = evBy.get(x.id); return (
                  <li key={x.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-medium">{who(x)}</span><Badge tone="info">{x.problem_code}</Badge></span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted tnum"><Badge mono>{shortId(x.id)}</Badge>{fmtTime(x.started_at)}</span>
                      {suBy.has(x.id) && <span className="text-sm text-text-muted tnum">Token: {trio(suBy.get(x.id)!)}</span>}
                      {ev && <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted tnum"><Badge>Gợi ý mức {ev.max_hint_level}</Badge><Badge>{Math.round(ev.duration_s / 60)} phút</Badge></span>}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">{ev ? <ScoreBadge total={ev.total} /> : <span className="text-text-muted">—</span>}<StatusBadge text={stateOf(x)} /><Helped x={x} /></span>
                  </li>); })}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead><tr className="border-b border-border-strong"><th className="py-2 pr-2">Mã phiên</th><th className="pr-2">Bắt đầu</th><th className="pr-2">Học sinh</th><th className="pr-2">Đề</th><th className="pr-2">Điểm</th><th className="pr-2">Gợi ý tối đa</th><th className="pr-2">Phút</th><th className="pr-2">Token in / out / thoughts</th><th>Trạng thái</th></tr></thead>
                  <tbody className="tnum">
                    {s.map((x) => { const ev = evBy.get(x.id); return (
                      <tr key={x.id} className="border-b border-border">
                        <td className="py-2 pr-2"><Badge mono>{shortId(x.id)}</Badge></td><td className="pr-2 whitespace-nowrap">{fmtTime(x.started_at)}</td><td className="pr-2">{who(x)}</td><td className="pr-2"><Badge tone="info">{x.problem_code}</Badge></td>
                        <td className="pr-2">{ev ? <ScoreBadge total={ev.total} /> : "—"}</td><td className="pr-2">{ev ? `Mức ${ev.max_hint_level}` : "—"}</td>
                        <td className="pr-2">{ev ? Math.round(ev.duration_s / 60) : "—"}</td><td className="pr-2 whitespace-nowrap">{suBy.has(x.id) ? trio(suBy.get(x.id)!) : "—"}</td>
                        <td><span className="flex flex-wrap items-center gap-1"><StatusBadge text={stateOf(x)} /><Helped x={x} /></span></td>
                      </tr>); })}
                  </tbody>
                </table>
              </div>
            </Section>
            <Section title="Hội thoại của học sinh">
              <p className="text-sm text-text-muted">Tin nhắn đã được che số điện thoại và email. Bấm vào từng học sinh để xem.</p>
              <div className="flex max-h-[70dvh] flex-col gap-2 overflow-y-auto pr-1">
                {s.map((x) => { const ev = evBy.get(x.id); return <ChatLog key={x.id} id={x.id} head={{ sid: shortId(x.id), time: fmtTime(x.started_at), who: who(x), problem: x.problem_code, total: ev?.total, state: stateOf(x), helped: helpedN(x) }} />; })}
              </div>
            </Section>
          </>
        )}
      </div>
    );
  }

  const cmps = [["Trước (pre) so với Sau (post)", "pre", "post"], ["Đối chứng so với Thực nghiệm", "control", "experiment"]] as const;

  return (
    <div className="flex flex-col gap-6">
      <h1>Thống kê</h1>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {links.map((l) => { const x = stats.get(l.id); const n = x?.sessions ?? 0; return (
          <li key={l.id}>
            <a href={`/dashboard/stats?link=${l.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-primary-soft">
              <span className="font-medium">{l.label} {l.tag && <span className="text-sm font-normal text-text-muted">· {TAG[l.tag]}</span>}</span>
              <span className="tnum text-sm text-text-muted">{x?.visits ?? 0} lượt mở · {n} phiên · {n ? Math.round(((x?.done ?? 0) / n) * 100) : 0}% xong · {n ? `${avgTen(x?.total_avg ?? 0)}/10` : "chưa đủ dữ liệu"}</span>
            </a>
          </li>); })}
      </ul>
      {cmps.map(([title, ta, tb]) => { const c = compareStats(tags.get(ta), tags.get(tb)); return c && (
        <Section key={title} title={title}>
          <p className="tnum">{TAG[ta]}: TB {avgTen(c.meanA)}, SD {avgTen(c.sdA)}, n={c.nA}. {TAG[tb]}: TB {avgTen(c.meanB)}, SD {avgTen(c.sdB)}, n={c.nB} (thang 10). Thống kê t ≈ {c.t ?? "—"}.</p>
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
