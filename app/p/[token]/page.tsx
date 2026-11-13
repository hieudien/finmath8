import { admin } from "@/lib/supabase/admin";
import { loadStudent } from "@/lib/students";
import { fmtTime, r1, sessionState, studentMsgs } from "@/lib/stats";
import { avgTen } from "@/lib/score";
import { shareOf } from "@/lib/share";
import Brand from "@/components/Brand";
import ParentChatLog from "@/components/ParentChatLog";
import { MathText } from "@/components/MathText";
import "katex/dist/katex.min.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kết quả học tập · MathStep AI", robots: { index: false, follow: false } };

type Advice = { weak_areas: string[]; suggestions: string[]; practice: string[] };
const SHOW = 20, TOP = 5;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-2 border-t border-border pt-4"><h2>{title}</h2>{children}</section>;
}
const List = ({ items }: { items: string[] }) => <ul className="list-disc space-y-1 pl-5">{items.map((x, i) => <li key={i}><MathText text={x} /></li>)}</ul>;

// Trang công khai cho phụ huynh (chỉ đọc). Dùng service-role nên mọi truy vấn lọc theo giáo viên và mã học sinh của liên kết.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sh = await shareOf(token);
  const prof = sh ? await loadStudent(admin() as never, sh.code, sh.teacherId) : null;
  if (!sh || !prof) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-3 px-4">
        <Brand tagline />
        <h1>Liên kết đã đóng</h1>
        <p className="text-text-muted">Liên kết này không còn dùng được. Hãy hỏi giáo viên để lấy liên kết mới.</p>
      </main>
    );
  }
  const db = admin();
  const { data: adv } = await db.from("student_advice").select("content").eq("teacher_id", sh.teacherId).eq("student_code", sh.code).maybeSingle();
  const advice = (adv as { content: Advice } | null)?.content;
  const shown = prof.attempts.slice(0, SHOW);
  const msgs = await studentMsgs(db as never, shown.map((a) => a.id));
  const done = prof.attempts.filter((a) => a.ev);
  const avg = done.length ? avgTen(done.reduce((n, a) => n + a.ev!.total, 0) / done.length) : null;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <Brand tagline />
      <div>
        <h1>{prof.names.join(" / ") || "Học sinh"}{prof.cls && <span className="tnum text-text-muted"> ({prof.cls})</span>}</h1>
        <p className="text-text-muted">Đã làm {prof.attempts.length} bài, {prof.evaluated} bài đã chấm{avg != null && <>. Điểm trung bình <span className="tnum font-medium text-text">{avg}/10</span></>}.</p>
      </div>

      {prof.evaluated > 0 && (
        <Section title="Điểm theo tiêu chí (thang 0–3)">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {prof.rubric.map((r) => <li key={r.key}><span className="block text-sm text-text-muted">{r.name}</span><span className="tnum text-2xl font-bold">{r1(r.value)}</span></li>)}
          </ul>
        </Section>
      )}
      {prof.weakSkills.length > 0 && <Section title="Kỹ năng cần củng cố"><List items={prof.weakSkills.slice(0, TOP).map((k) => k.name)} /></Section>}
      {prof.errors.length > 0 && <Section title="Lỗi hay mắc"><List items={prof.errors.slice(0, TOP).map((e) => e.name)} /></Section>}
      {advice && (
        <Section title="Nhận xét và gợi ý">
          {advice.weak_areas.length > 0 && <><h3 className="font-medium">Điểm cần cải thiện</h3><List items={advice.weak_areas.slice(0, TOP)} /></>}
          {advice.suggestions.length > 0 && <><h3 className="font-medium">Nên làm</h3><List items={advice.suggestions.slice(0, TOP)} /></>}
          {advice.practice.length > 0 && <><h3 className="font-medium">Dạng bài nên luyện thêm</h3><List items={advice.practice.slice(0, TOP)} /></>}
          <p className="text-sm text-text-muted">Nhận xét do AI tổng hợp, mang tính tham khảo.</p>
        </Section>
      )}
      <Section title="Các bài đã làm">
        {shown.length === 0 && <p className="text-text-muted">Chưa có bài nào.</p>}
        <ul className="flex max-h-[70dvh] flex-col gap-2 overflow-y-auto pr-1">
          {shown.map((a) => (
            <li key={a.id}><ParentChatLog token={token} id={a.id} head={{ time: fmtTime(a.started_at), problem: a.title, total: a.ev?.total, state: sessionState(a, a.ev, msgs.get(a.id)), helped: a.revealed }} /></li>
          ))}
        </ul>
        {prof.attempts.length > SHOW && <p className="text-sm text-text-muted">Hiển thị {SHOW} bài gần nhất trong {prof.attempts.length} bài.</p>}
      </Section>
    </main>
  );
}
