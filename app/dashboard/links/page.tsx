import { supabaseServer } from "@/lib/supabase/server";
import { CreateLink, LinkActions } from "@/components/LinkTools";
import { Empty, LinkButton } from "@/components/ui";

type L = { id: string; slug: string; label: string; tag: string | null; active: boolean; created_at: string; problems_snapshot: unknown[] };
const TAG: Record<string, string> = { pre: "Trước", post: "Sau", experiment: "Thực nghiệm", control: "Đối chứng" };

export default async function Page() {
  const sb = await supabaseServer();
  const [{ data: pr }, { data: ln }] = await Promise.all([
    sb.from("problems").select("id,code,content").is("deleted_at", null).order("code"),
    sb.from("public_links").select("id,slug,label,tag,active,created_at,problems_snapshot").order("created_at", { ascending: false }),
  ]);
  const problems = ((pr ?? []) as { id: string; code: string; content: { title: string } }[]).map((p) => ({ id: p.id, code: p.code, title: p.content.title }));
  const links = (ln ?? []) as L[];
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  return (
    <div className="flex flex-col gap-6">
      <h1>Liên kết cho học sinh</h1>
      {problems.length === 0 ? <Empty text="Cần nạp đề trước khi tạo liên kết." action={<LinkButton href="/dashboard/problems">Nạp đề</LinkButton>} /> : <CreateLink problems={problems} />}
      <section aria-labelledby="ll" className="flex flex-col gap-3">
        <h2 id="ll">Đã tạo ({links.length})</h2>
        {links.length === 0 ? <Empty text="Chưa có liên kết nào." /> : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {links.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 px-4 py-3">
                <div>
                  <p className="font-medium">{l.label} {l.tag && <span className="text-sm text-text-muted">· {TAG[l.tag]}</span>}</p>
                  <p className="text-sm text-text-muted">
                    <span className={l.active ? "text-success" : "text-danger"}>{l.active ? "Đang mở" : "Đã tắt"}</span> · {l.problems_snapshot.length} đề · {fmt.format(new Date(l.created_at))}
                  </p>
                  <div className="flex flex-wrap gap-x-4">
                    <a className="break-anywhere inline-flex min-h-11 items-center text-sm text-primary underline" href={`/c/${l.slug}`} target="_blank" rel="noreferrer">/c/{l.slug}</a>
                    <a className="inline-flex min-h-11 items-center text-sm text-primary underline" href={`/dashboard/stats?link=${l.id}`}>Thống kê</a>
                  </div>
                </div>
                <LinkActions id={l.id} slug={l.slug} active={l.active} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
