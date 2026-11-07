import { supabaseServer, currentUser } from "@/lib/supabase/server";
import { LinkButton } from "@/components/ui";
import { check } from "@/lib/db";
import { summarize, type Ev, type Sess } from "@/lib/stats";
import { summarizeUsage, windowStart } from "@/lib/usage";
import UsageCard from "@/components/UsageCard";

type L = { id: string; label: string; active: boolean };
const STATUS: Record<string, string> = { active: "Đang làm", done: "Hoàn thành" };

export default async function Page() {
  const u = (await currentUser())!;
  const sb = await supabaseServer();
  const start = windowStart();
  const res = await Promise.all([
    sb.from("teacher_settings").select("*").eq("teacher_id", u.id).maybeSingle(),
    sb.from("problems").select("id", { count: "exact", head: true }).is("deleted_at", null),
    sb.from("public_links").select("id,label,active").order("created_at", { ascending: false }),
    sb.from("chat_sessions").select("id,link_id,seq,status,started_at,problem_code").order("started_at", { ascending: false }),
    sb.from("session_evals").select("*"),
    sb.from("activity_logs").select("action,ts,meta").in("action", ["ai_call", "model_fallback", "quota_hit"]).gte("ts", start.toISOString()).limit(5000),
    sb.from("activity_logs").select("meta").eq("action", "quota_hit").eq("meta->>kind", "day").not("meta->>limit", "is", null).order("id", { ascending: false }).limit(1),
  ]);
  res.forEach(check);
  const [{ data: s }, { count: np }, { data: ln }, { data: ss }, { data: es }, { data: lg }, { data: lq }] = res as unknown as [
    { data: { provider: string; gemini_key_enc: string | null; openai_key_enc: string | null; daily_limit?: number } | null }, { count: number | null }, { data: L[] | null }, { data: Sess[] | null }, { data: Ev[] | null }, { data: { action: string; ts: string; meta: { model?: string; in?: number; out?: number } }[] | null }, { data: { meta: { limit?: number } }[] | null },
  ];
  const links = ln ?? [];
  const sessions = ss ?? [];
  const hasKey = !!(s && (s.provider === "openai" ? s.openai_key_enc : s.gemini_key_enc));
  const steps = [
    { done: hasKey, text: "Chọn nhà cung cấp AI (Gemini hoặc ChatGPT) và nhập API key", href: "/dashboard/settings", cta: "Mở cài đặt" },
    { done: (np ?? 0) > 0, text: "Nạp đề bài (JSON hoặc văn bản)", href: "/dashboard/problems", cta: "Nạp đề" },
    { done: links.length > 0, text: "Tạo liên kết cho học sinh", href: "/dashboard/links", cta: "Tạo liên kết" },
  ];
  const next = steps.find((x) => !x.done);
  const m = summarize(sessions, es ?? [], 0);
  const label = new Map(links.map((l) => [l.id, l.label]));
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
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
      {hasKey && <UsageCard {...summarizeUsage(lg ?? [])} limit={s?.daily_limit ?? 0} learned={lq?.[0]?.meta.limit ?? 0} resetAt={new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(start.getTime() + 864e5)) + " giờ Việt Nam"} />}
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
              {sessions.slice(0, 5).map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="min-w-0"><span className="font-medium">HS #{x.seq} · {x.problem_code}</span> <span className="text-sm text-text-muted">· {label.get(x.link_id) ?? "Liên kết đã xóa"}</span></span>
                  <span className="text-sm text-text-muted">{STATUS[x.status] ?? "Bỏ dở"} · {fmt.format(new Date(x.started_at))}</span>
                </li>
              ))}
            </ul>
          </section>
          {m.enough && (es ?? []).length > 0 && (
            <section className="flex flex-col gap-2 border-t border-border pt-4" aria-labelledby="sum">
              <h2 id="sum">Kết quả chung</h2>
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {([["Điểm TB / 12", m.totalAvg], ["Đúng kết luận", `${m.correctPct}%`], ["Thời gian TB (phút)", m.durationMin], ["Lần tăng gợi ý TB", m.hintAvg]] as [string, string | number][]).map(([k, v]) => (
                  <div key={k}><dt className="text-sm text-text-muted">{k}</dt><dd className="tnum text-2xl font-bold">{v}</dd></div>
                ))}
              </dl>
              {m.errors.length > 0 && (
                <div>
                  <p className="text-sm text-text-muted">Lỗi học sinh hay gặp nhất</p>
                  <ul className="list-disc pl-5">{m.errors.slice(0, 3).map((e) => <li key={e.name}>{e.name} <span className="tnum text-text-muted">({e.value})</span></li>)}</ul>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
