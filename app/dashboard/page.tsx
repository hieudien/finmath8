import { supabaseServer, currentUser } from "@/lib/supabase/server";
import { Badge, LinkButton, StatusBadge } from "@/components/ui";
import { check } from "@/lib/db";
import { sweep } from "@/lib/sweep";
import Link from "next/link";
import { fmtTime, hardSteps, r1, sessionState, studentMsgs, who, type StepInfo } from "@/lib/stats";
import { MathText } from "@/components/MathText";

type L = { id: string; label: string; active: boolean };
type Sess = { id: string; link_id: string; seq: number; status: string; started_at: string; problem_code: string; student_code: string | null; student_name: string | null };
type Ov = { sessions: number; done: number; evals: number; total_avg: number; correct_pct: number; duration_s: number; hint_avg: number };

export default async function Page() {
  const u = (await currentUser())!;
  const sb = await supabaseServer();
  sweep();
  // Số liệu gom sẵn trong DB (view overview_stats, error_counts): không kéo toàn bộ phiên/chấm điểm/nhật ký về.
  const res = await Promise.all([
    sb.from("teacher_settings").select("*").eq("teacher_id", u.id).maybeSingle(),
    sb.from("problems").select("id", { count: "exact", head: true }).is("deleted_at", null),
    sb.from("public_links").select("id,label,active").order("created_at", { ascending: false }),
    sb.from("chat_sessions").select("id,link_id,seq,status,started_at,problem_code,student_code,student_name").order("started_at", { ascending: false }).limit(5),
    sb.from("overview_stats").select("*").maybeSingle(),
    sb.from("error_counts").select("name,value").order("value", { ascending: false }).limit(5),
  ]);
  res.forEach(check);
  const [{ data: s }, { count: np }, { data: ln }, { data: ss }, { data: ov }, { data: er }] = res as unknown as [
    { data: { provider: string; gemini_key_enc: string | null; openai_key_enc: string | null} | null }, { count: number | null }, { data: L[] | null }, { data: Sess[] | null }, { data: Ov | null }, { data: { name: string; value: number }[] | null },
  ];
  const links = ln ?? [];
  const recent = ss ?? [];
  // Bước gặp khó của cả lớp: chỉ lấy phiên có bước gặp khó (PostgREST cắt 1000 dòng), phiên mới nhất trước.
  const [msgs, hs, pr] = await Promise.all([
    studentMsgs(sb, recent.map((x) => x.id)),
    sb.from("chat_sessions").select("id,problem_code,student_code,student_name,struggled").gt("struggled", 0).order("started_at", { ascending: false }).limit(1000),
    sb.from("problems").select("code,title:content->>title,steps:content->solution_steps,goals:content->step_goals").is("deleted_at", null),
  ]);
  const info = new Map<string, StepInfo>(((pr.data ?? []) as { code: string; title: string | null; steps: string[] | null; goals: string[] | null }[]).map((x) => [x.code, { title: x.title ?? x.code, steps: x.steps ?? [], goals: x.goals?.length === x.steps?.length ? x.goals ?? [] : [] }]));
  const hard = hardSteps((hs.data ?? []) as { id: string; problem_code: string; student_code: string | null; student_name: string | null; struggled: number }[], info).slice(0, 5); // lỗi đọc thì bỏ khối này, không làm hỏng trang
  const hasKey = !!(s && (s.provider === "openai" ? s.openai_key_enc : s.gemini_key_enc));
  const steps = [
    { done: hasKey, text: "Chọn nhà cung cấp AI (Gemini hoặc ChatGPT) và nhập API key", href: "/dashboard/settings", cta: "Mở cài đặt" },
    { done: (np ?? 0) > 0, text: "Nạp đề bài (JSON hoặc văn bản)", href: "/dashboard/problems", cta: "Nạp đề" },
    { done: links.length > 0, text: "Tạo liên kết cho học sinh", href: "/dashboard/links", cta: "Tạo liên kết" },
  ];
  const next = steps.find((x) => !x.done);
  const o: Ov = ov ?? { sessions: 0, done: 0, evals: 0, total_avg: 0, correct_pct: 0, duration_s: 0, hint_avg: 0 };
  const m = { sessions: o.sessions, completion: o.sessions ? Math.round((o.done / o.sessions) * 100) : 0, totalAvg: r1(o.total_avg), correctPct: Math.round(o.correct_pct), durationMin: r1(o.duration_s / 60), hintAvg: r1(o.hint_avg), errors: er ?? [] };
  const label = new Map(links.map((l) => [l.id, l.label]));
  const kpis: [string, string | number][] = [
    ["Đề bài", np ?? 0],
    ["Liên kết đang mở", links.filter((l) => l.active).length],
    ["Phiên chat", m.sessions],
    ["Hoàn thành", m.sessions ? `${m.completion}%` : "—"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1>Tổng quan</h1>
      {next && (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-labelledby="setup">
          <h2 id="setup">Bắt đầu nhanh</h2>
          <ol className="flex flex-col divide-y divide-border">
            {steps.map((x, i) => (
              <li key={x.text} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0"><span className="tnum text-text-muted">{i + 1}.</span> {x.text}</span>
                <span className={`shrink-0 whitespace-nowrap text-sm ${x.done ? "text-success" : "text-text-muted"}`}>{x.done ? "Đã xong" : "Chưa làm"}</span>
              </li>
            ))}
          </ol>
          <LinkButton href={next.href} className="self-start">{next.cta}</LinkButton>
        </section>
      )}
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map(([k, v]) => <div key={k}><dt className="text-sm text-text-muted">{k}</dt><dd className="tnum text-2xl font-bold">{v}</dd></div>)}
      </dl>
      {m.sessions === 0 ? (
        !next && <p className="text-text-muted">Gửi liên kết cho học sinh, hoạt động sẽ hiện ở đây.</p>
      ) : (
        <>
          <section className="flex flex-col gap-2 border-t border-border pt-4" aria-labelledby="recent">
            <div className="flex items-center justify-between gap-2"><h2 id="recent">Hoạt động gần đây</h2><LinkButton href="/dashboard/stats" variant="ghost">Xem thống kê</LinkButton></div>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {recent.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="min-w-0"><span className="font-medium">{who(x)}</span> <Badge tone="info">{x.problem_code}</Badge> <span className="text-sm text-text-muted">· {label.get(x.link_id) ?? "Liên kết đã xóa"}</span></span>
                  <span className="flex items-center gap-2 text-sm text-text-muted"><StatusBadge text={x.status === "done" ? "Hoàn thành" : sessionState(x, null, msgs.get(x.id))} />Bắt đầu: {fmtTime(x.started_at)}</span>
                </li>
              ))}
            </ul>
          </section>
          {(hard.length > 0 || m.errors.length > 0) && (
            <div className="grid gap-6 border-t border-border pt-4 md:grid-cols-2">
              {hard.length > 0 && (
                <section className="flex flex-col gap-2" aria-labelledby="hard">
                  <div className="flex items-center justify-between gap-2"><h2 id="hard">Bước học sinh hay gặp khó</h2><LinkButton href="/dashboard/stats" variant="ghost">Xem thống kê</LinkButton></div>
                  <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
                    {hard.map((h) => (
                      <li key={`${h.code}-${h.step}`}>
                        <details className="group">
                          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-primary-soft">
                            <span className="min-w-0"><Badge tone="info">{h.code}</Badge> <span className="font-medium">Bước {h.step}</span>: {h.label}</span>
                            <span className="tnum font-semibold">{h.n} học sinh <span className="text-text-muted group-open:hidden">▾</span><span className="hidden text-text-muted group-open:inline">▴</span></span>
                          </summary>
                          <ul className="flex flex-col gap-1 border-t border-border px-4 py-2 text-sm">
                            {h.students.map((w, i) => (
                              <li key={w.code ?? i} className="flex flex-wrap items-center justify-between gap-2">
                                {w.code ? <Link href={`/dashboard/students/${encodeURIComponent(w.code)}`} className="text-primary underline">{w.name ?? "Học sinh"} ({w.code})</Link> : <span>Ẩn danh (cũ)</span>}
                                <span className="tnum text-text-muted">{w.times} phiên</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {m.errors.length > 0 && (
                <section className="flex flex-col gap-2" aria-labelledby="errs">
                  <h2 id="errs">Lỗi học sinh hay gặp</h2>
                  <ul className="list-disc rounded-lg border border-border bg-surface py-3 pl-9 pr-4">{m.errors.map((e) => <li key={e.name}><MathText text={e.name} /> <span className="tnum text-text-muted">({e.value})</span></li>)}</ul>
                </section>
              )}
            </div>
          )}
          {o.evals > 0 && (
            <section className="flex flex-col gap-2 border-t border-border pt-4" aria-labelledby="sum">
              <h2 id="sum">Kết quả chung</h2>
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {([["Điểm TB / 12", m.totalAvg], ["Đúng kết luận", `${m.correctPct}%`], ["Thời gian TB (phút)", m.durationMin], ["Lần tăng gợi ý TB", m.hintAvg]] as [string, string | number][]).map(([k, v]) => (
                  <div key={k}><dt className="text-sm text-text-muted">{k}</dt><dd className="tnum text-2xl font-bold">{v}</dd></div>
                ))}
              </dl>
            </section>
          )}
        </>
      )}
    </div>
  );
}
