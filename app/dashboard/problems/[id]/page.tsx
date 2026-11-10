import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { hasGuides } from "@/lib/chat/goals";
import { problemSchema } from "@/lib/schema/problem";
import { lintProblem } from "@/lib/lint";
import { entries, problemToText } from "@/lib/problem-text";
import { ExplainButton, ViewTools } from "@/components/ProblemViewTools";
import { Alert, Badge } from "@/components/ui";
import { AnswerBox } from "@/components/AnswerBox";
import { substituteState } from "@/lib/verify-solution";
import { MathText } from "@/components/MathText";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Rows({ items }: { items: { key: string; label: string; value: string }[] }) {
  return (
    <dl className="divide-y divide-border rounded-lg border border-border bg-surface">
      {items.map((e) => (
        <div key={e.key} className="flex flex-col gap-1 px-4 py-2 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="text-text-muted">{e.label}</dt>
          <dd className="tnum break-anywhere font-medium sm:text-right">{e.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-2 break-inside-avoid"><h2>{title}</h2>{children}</section>;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { data, error } = await (await supabaseServer()).from("problems").select("id,content").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("Lỗi cơ sở dữ liệu: " + error.message);
  if (!data) notFound();
  const parsed = problemSchema.safeParse((data as { content: unknown }).content);
  if (!parsed.success) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/dashboard/problems" className="text-sm text-primary underline">Về danh sách đề</Link>
        <Alert tone="danger">Đề này lưu sai định dạng nên không hiển thị được. Hãy nạp lại đề, hoặc liên hệ quản trị viên.</Alert>
      </div>
    );
  }
  const p = parsed.data;
  const guided = hasGuides(p);
  const hints = [...p.hints].sort((a, b) => a.level - b.level);
  const lint = [...(p.check_note ? [p.check_note] : []), ...lintProblem(p)];

  return (
    <article className="flex max-w-3xl flex-col gap-6">
      <div className="print:hidden">
        <Link href="/dashboard/problems" className="inline-flex min-h-11 items-center text-sm text-primary underline">Về danh sách đề</Link>
      </div>
      <header className="flex flex-col gap-1">
        <p className="tnum text-sm text-text-muted">{p.id} · Lớp {p.grade}{p.topic ? ` · ${p.topic}` : ""}</p>
        <h1 className="flex flex-wrap items-center gap-2">{p.title} <Badge tone={p.answer_locked ? "success" : "warn"}>{p.answer_locked ? "Đáp án đã khóa" : "Chưa xác nhận đáp án"}</Badge></h1>
      </header>

      <AnswerBox id={id} solution={p.solution} locked={p.answer_locked} check={substituteState(p).state} />

      <ViewTools text={problemToText(p)} />

      <div className="flex flex-col gap-2 print:hidden">
        <ExplainButton id={id} />
        <p className="text-sm text-text-muted">AI tạo lại dữ kiện, đáp án, lời giải, sai lầm thường gặp, gợi ý và câu mở rộng từ đề bài, ghi đè nội dung cũ. Luôn dùng được, kể cả khi đề đã đạt chuẩn.</p>
      </div>

      {lint.length > 0 && (
        <Alert tone="warning">
          <p className="font-medium">Nên xem lại đề này:</p>
          <ul className="list-disc space-y-1 pl-5">{lint.map((t) => <li key={t}>{t}</li>)}</ul>
        </Alert>
      )}

      <Section title="Đề bài">
        {p.statement ? <p className="max-w-prose"><MathText text={p.statement} /></p> : <Alert tone="warning">Đề chưa có phần nội dung bài (statement). Chatbot sẽ tự nêu tình huống từ dữ kiện.</Alert>}
      </Section>

      {Object.keys(p.data).length > 0 && <Section title="Dữ kiện"><Rows items={entries(p.data)} /></Section>}

      <Section title="Lời giải">
        {p.solution_steps.length ? (
          <>
            <ol className="flex max-w-prose flex-col gap-2">
              {p.solution_steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="tnum w-14 shrink-0 font-medium text-primary">Bước {i + 1}</span>
                  <div>
                    <MathText text={s} />
                    {hasGuides(p) && p.step_goals[i] && <p className="text-sm text-text-muted">Học sinh thấy: <MathText text={p.step_goals[i]} /></p>}
                    {p.step_checks.length === p.solution_steps.length && p.step_checks[i].result && <p className="text-sm text-text-muted">Kết quả chuẩn (server chấm theo đây): <MathText text={p.step_checks[i].result} /></p>}
                    {p.error_traps.filter((e) => e.step === i + 1).map((e, k) => <p key={k} className="text-sm text-text-muted">Nếu học sinh nộp <MathText text={e.wrong} />: <MathText text={e.why} /></p>)}
                  </div>
                </li>
              ))}
            </ol>
            {!guided && (
              <Alert tone="info">Chưa đủ chỉ dẫn cho từng bước (việc cần làm, gợi ý), nên học sinh chỉ thấy lời nhắc chung và gợi ý chung của đề. Bấm Chuẩn hóa đề ở đầu trang để AI viết chỉ dẫn cho từng bước. Sửa lời giải xong thì bấm lại.</Alert>
            )}
          </>
        ) : (
          <Alert tone="warning">Đề này chưa có lời giải từng bước nên học sinh chưa làm được (liên kết cũ giữ đề cũ, cần tạo liên kết mới). Bấm Chuẩn hóa đề ở đầu trang để AI viết giúp; lời giải được kiểm tra khớp đáp án trước khi lưu.</Alert>
        )}
      </Section>

      <Section title="Kết quả">
        <Rows items={entries(p.solution)} />
        {Object.keys(p.solution).length > 0 && <ExplainButton id={id} action="verify" label="Kiểm tra đáp án bằng AI" busyLabel="AI đang giải lại để so..." />}
      </Section>

      {p.common_errors.length > 0 && (
        <Section title="Sai lầm thường gặp"><ul className="list-disc space-y-1 pl-5">{p.common_errors.map((e, i) => <li key={i}><MathText text={e} /></li>)}</ul></Section>
      )}

      <Section title="Gợi ý cho học sinh">
        <ol className="flex flex-col gap-2">
          {hints.map((h) => <li key={h.level} className="flex gap-3"><span className="tnum w-14 shrink-0 font-medium text-primary">Mức {h.level}</span><MathText text={h.text} /></li>)}
        </ol>
      </Section>

      {p.extension && <Section title="Câu hỏi mở rộng"><p className="max-w-prose"><MathText text={p.extension} /></p></Section>}
    </article>
  );
}
