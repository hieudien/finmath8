import { supabaseServer, currentUser } from "@/lib/supabase/server";
import { LinkButton } from "@/components/ui";

export default async function Page() {
  const u = (await currentUser())!;
  const sb = await supabaseServer();
  const [{ data: s }, { count: np }, { count: nl }, { count: ns }] = await Promise.all([
    sb.from("teacher_settings").select("provider,gemini_key_enc,openai_key_enc").eq("teacher_id", u.id).maybeSingle(),
    sb.from("problems").select("id", { count: "exact", head: true }).is("deleted_at", null),
    sb.from("public_links").select("id", { count: "exact", head: true }),
    sb.from("chat_sessions").select("id", { count: "exact", head: true }),
  ]);
  const k = s as { provider: string; gemini_key_enc: string | null; openai_key_enc: string | null } | null;
  const hasKey = !!(k && (k.provider === "openai" ? k.openai_key_enc : k.gemini_key_enc));
  const steps = [
    { done: hasKey, text: "Chọn nhà cung cấp AI (Gemini hoặc ChatGPT) và nhập API key", href: "/dashboard/settings", cta: "Mở cài đặt" },
    { done: (np ?? 0) > 0, text: "Nạp đề bài (JSON hoặc văn bản)", href: "/dashboard/problems", cta: "Nạp đề" },
    { done: (nl ?? 0) > 0, text: "Tạo liên kết cho học sinh", href: "/dashboard/links", cta: "Tạo liên kết" },
    { done: (ns ?? 0) > 0, text: "Học sinh chat, xem thống kê", href: "/dashboard/stats", cta: "Xem thống kê" },
  ];
  const next = steps.find((x) => !x.done);
  return (
    <div className="flex flex-col gap-6">
      <h1>Tổng quan</h1>
      <ol className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {steps.map((x, i) => (
          <li key={x.text} className="flex items-start justify-between gap-3 px-4 py-3">
            <span className="min-w-0"><span className="tnum text-text-muted">{i + 1}.</span> {x.text}</span>
            <span className={`shrink-0 whitespace-nowrap text-sm ${x.done ? "text-success" : "text-text-muted"}`}>{x.done ? "Đã xong" : "Chưa làm"}</span>
          </li>
        ))}
      </ol>
      {next ? <LinkButton href={next.href} className="self-start">{next.cta}</LinkButton> : <p className="text-text-muted">Đã làm đủ các bước. Gửi liên kết cho học sinh và theo dõi ở Thống kê.</p>}
      <dl className="grid grid-cols-3 gap-4 border-t border-border pt-4">
        {[["Đề bài", np], ["Liên kết", nl], ["Phiên chat", ns]].map(([k, v]) => (
          <div key={String(k)}><dt className="text-sm text-text-muted">{k}</dt><dd className="tnum text-2xl font-bold">{v ?? 0}</dd></div>
        ))}
      </dl>
    </div>
  );
}
