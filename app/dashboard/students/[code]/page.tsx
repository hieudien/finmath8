import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadStudent } from "@/lib/students";
import { fmtTime, sessionState, studentMsgs } from "@/lib/stats";
import { critTen } from "@/lib/score";
import { shortId } from "@/lib/sid";
import AdviceButton from "@/components/AdviceButton";
import ShareButton from "@/components/ShareButton";
import StudentDelete from "@/components/StudentDelete";
import ChatLog from "@/components/ChatLog";
import { Badge } from "@/components/ui";
import { MathText } from "@/components/MathText";
import "katex/dist/katex.min.css";

type Advice = { content: { weak_areas: string[]; suggestions: string[]; practice: string[]; step_review?: { step: string; review: string }[] }; sessions: number; updated_at: string };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-2 border-t border-border pt-4"><h2>{title}</h2>{children}</section>;
}
const List = ({ items }: { items: string[] }) => <ul className="list-disc space-y-1 pl-5">{items.map((x, i) => <li key={i}><MathText text={x} /></li>)}</ul>;

const SHOW = 30; // số phiên dựng sẵn; phiên được trỏ tới (?phien=) luôn được dựng

export default async function Page({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ phien?: string; all?: string }> }) {
  const { phien, all } = await searchParams;
  const raw = (await params).code;
  let code = raw;
  try { code = decodeURIComponent(raw); } catch { notFound(); } // %zz trong URL: 404, không 500
  if (!/^[A-Z0-9._-]{1,80}$/.test(code)) notFound();
  const sb = await supabaseServer();
  const [prof, adv] = await Promise.all([loadStudent(sb, code), sb.from("student_advice").select("content,sessions,updated_at").eq("student_code", code).maybeSingle()]);
  if (!prof) notFound();
  const shown = prof.attempts.filter((a, i) => all || i < SHOW || a.id === phien);
  const msgs = await studentMsgs(sb, shown.map((a) => a.id));
  const notes = new Map<string, string[]>(); // phiên -> ghi chú gặp khó của phiên đó
  for (const w of prof.weakProblems) for (const x of w.sessions) (notes.get(x.id) ?? notes.set(x.id, []).get(x.id)!).push(x.helped ? "Gặp khó, bot phải hiện lời giải" : "Gặp khó (gợi ý, hỏi hoặc nộp sai)");
  const advice = adv.data as Advice | null;
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/dashboard/students" className="inline-flex min-h-11 items-center text-sm text-primary underline">Tất cả học sinh</Link>
        <h1>{prof.names.join(" / ") || "Học sinh"} <span className="tnum text-text-muted">({prof.cls || prof.code})</span></h1>
        <p className="text-text-muted">{prof.attempts.length} phiên, {prof.evaluated} phiên đã chấm.</p>
        <div className="flex flex-wrap items-start gap-2"><ShareButton code={prof.code} /><StudentDelete code={prof.code} /></div>
      </div>

      <Section title="Điểm trung bình theo tiêu chí (thang 10)">
        {prof.evaluated === 0 ? <p className="text-text-muted">Chưa có bài nào được chấm.</p> : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {prof.rubric.map((r) => <li key={r.key}><span className="block text-sm text-text-muted">{r.name}</span><span className="tnum text-2xl font-bold">{critTen(r.value)}</span></li>)}
          </ul>
        )}
      </Section>

      {prof.weakProblems.length > 0 && (
        <Section title="Đề yếu">
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {prof.weakProblems.map((w) => (
              <li key={w.code}>
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-primary-soft">
                    <span className="min-w-0"><span className="text-sm text-text-muted">{w.code}</span><span className="block font-medium">{w.title}</span></span>
                    <span className="tnum flex flex-wrap items-center gap-2 text-sm text-text-muted">Gặp khó {w.struggled}/{w.of} phiên{w.revealed > 0 && <Badge tone="warn">Giải hộ {w.revealed}</Badge>}<span className="group-open:hidden">▾</span><span className="hidden group-open:inline">▴</span></span>
                  </summary>
                  <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto border-t border-border px-4 py-2 text-sm">
                    {w.sessions.map((x) => (
                      <li key={x.id} className="flex flex-wrap items-center justify-between gap-2">
                        <Link href={`/dashboard/students/${encodeURIComponent(prof.code)}?phien=${x.id}#s-${x.id}`} className="tnum text-primary underline">{x.started_at ? fmtTime(x.started_at) : shortId(x.id)} · phiên {shortId(x.id)}</Link>
                        {x.helped && <Badge tone="warn">Giải hộ</Badge>}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {prof.weakSkills.length > 0 && <Section title="Kỹ năng cần củng cố"><List items={prof.weakSkills.map((k) => `${k.name} (${k.value} bài làm chưa tốt)`)} /></Section>}
      {prof.gaps.length > 0 && <Section title="Kiến thức nền còn thiếu (khi được giải hộ)"><List items={prof.gaps.map((g) => `${g.name}${g.value > 1 ? ` (${g.value} phiên)` : ""}`)} /></Section>}
      {prof.errors.length > 0 && <Section title="Lỗi hay mắc"><List items={prof.errors.map((e) => `${e.name} (${e.value} lần)`)} /></Section>}

      <Section title="Đề xuất cải thiện">
        {advice && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-muted">AI phân tích lúc {fmt.format(new Date(advice.updated_at))}, dựa trên {advice.sessions} phiên{advice.sessions < prof.attempts.length ? " (đã có phiên mới, nên phân tích lại)" : ""}. Đây là gợi ý tham khảo.</p>
            {advice.content.weak_areas.length > 0 && <><h3 className="font-medium">Điểm yếu</h3><List items={advice.content.weak_areas} /></>}
            {advice.content.suggestions.length > 0 && <><h3 className="font-medium">Nên làm</h3><List items={advice.content.suggestions} /></>}
            {!!advice.content.step_review?.length && <><h3 className="font-medium">Ôn tập theo bước</h3><ul className="list-disc space-y-1 pl-5">{advice.content.step_review.map((r, i) => <li key={i}><span className="font-medium">{r.step}:</span> <MathText text={r.review} /></li>)}</ul></>}
            {advice.content.practice.length > 0 && <><h3 className="font-medium">Dạng bài nên luyện thêm</h3><List items={advice.content.practice} /></>}
          </div>
        )}
        <AdviceButton code={prof.code} has={!!advice} />
      </Section>

      <Section title="Các bài đã làm">
        <ul className="flex max-h-[70dvh] flex-col gap-2 overflow-y-auto pr-1">
          {shown.map((a) => (
            <li key={a.id} className="flex flex-col gap-2">
              <ChatLog id={a.id} open={a.id === phien} note={notes.get(a.id)} head={{ sid: shortId(a.id), time: fmtTime(a.started_at), problem: a.title, total: a.ev?.total, state: sessionState(a, a.ev, msgs.get(a.id)), helped: a.revealed }} />
            </li>
          ))}
        </ul>
        {shown.length < prof.attempts.length && <Link href={`/dashboard/students/${encodeURIComponent(prof.code)}?all=1`} className="inline-flex min-h-11 items-center self-start text-primary underline">Xem tất cả {prof.attempts.length} phiên</Link>}
      </Section>
    </div>
  );
}
