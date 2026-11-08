import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { loadStudent } from "@/lib/students";
import { r1 } from "@/lib/stats";
import AdviceButton from "@/components/AdviceButton";
import ChatLog from "@/components/ChatLog";
import "katex/dist/katex.min.css";

type Advice = { content: { weak_areas: string[]; suggestions: string[]; practice: string[] }; sessions: number; updated_at: string };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-2 border-t border-border pt-4"><h2>{title}</h2>{children}</section>;
}
const List = ({ items }: { items: string[] }) => <ul className="list-disc space-y-1 pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const raw = (await params).code;
  let code = raw;
  try { code = decodeURIComponent(raw); } catch { notFound(); } // %zz trong URL: 404, không 500
  if (!/^[A-Z0-9._-]{1,20}$/.test(code)) notFound();
  const sb = await supabaseServer();
  const [prof, adv] = await Promise.all([loadStudent(sb, code), sb.from("student_advice").select("content,sessions,updated_at").eq("student_code", code).maybeSingle()]);
  if (!prof) notFound();
  const advice = adv.data as Advice | null;
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/dashboard/students" className="inline-flex min-h-11 items-center text-sm text-primary underline">Tất cả học sinh</Link>
        <h1>{prof.names.join(" / ") || "Học sinh"} <span className="tnum text-text-muted">({prof.code})</span></h1>
        <p className="text-text-muted">{prof.attempts.length} phiên, {prof.evaluated} phiên đã chấm.</p>
      </div>

      <Section title="Điểm trung bình theo tiêu chí (thang 0–3)">
        {prof.evaluated === 0 ? <p className="text-text-muted">Chưa có bài nào được chấm.</p> : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {prof.rubric.map((r, i) => <li key={r.key}><span className="block text-sm text-text-muted">{r.name}{i === 0 ? " (yếu nhất)" : ""}</span><span className={`tnum text-2xl font-bold ${i === 0 ? "text-danger" : ""}`}>{r1(r.value)}</span></li>)}
          </ul>
        )}
      </Section>

      {prof.weakSkills.length > 0 && <Section title="Kỹ năng cần củng cố"><List items={prof.weakSkills.map((k) => `${k.name} (${k.value} bài làm chưa tốt)`)} /></Section>}
      {prof.errors.length > 0 && <Section title="Lỗi hay mắc"><List items={prof.errors.map((e) => `${e.name} (${e.value} lần)`)} /></Section>}

      <Section title="Đề xuất cải thiện">
        {advice && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-muted">AI phân tích lúc {fmt.format(new Date(advice.updated_at))}, dựa trên {advice.sessions} phiên{advice.sessions < prof.attempts.length ? " (đã có phiên mới, nên phân tích lại)" : ""}. Đây là gợi ý tham khảo.</p>
            {advice.content.weak_areas.length > 0 && <><h3 className="font-medium">Điểm yếu</h3><List items={advice.content.weak_areas} /></>}
            {advice.content.suggestions.length > 0 && <><h3 className="font-medium">Nên làm</h3><List items={advice.content.suggestions} /></>}
            {advice.content.practice.length > 0 && <><h3 className="font-medium">Dạng bài nên luyện thêm</h3><List items={advice.content.practice} /></>}
          </div>
        )}
        <AdviceButton code={prof.code} has={!!advice} />
      </Section>

      <Section title="Các bài đã làm">
        <ul className="flex flex-col gap-2">
          {prof.attempts.map((a) => (
            <li key={a.id} className="flex flex-col gap-2">
              <ChatLog id={a.id} title={`${a.title} · ${fmt.format(new Date(a.started_at))} · ${a.ev ? `${a.ev.total}/12, ${a.ev.final_correct ? "đúng" : "chưa đúng"}` : a.status === "active" ? "đang làm" : "bỏ dở"}`} />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
