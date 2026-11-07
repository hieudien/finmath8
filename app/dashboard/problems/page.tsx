import { supabaseServer } from "@/lib/supabase/server";
import { ImportPanel, ProblemActions } from "@/components/ProblemTools";
import { Empty } from "@/components/ui";

type Row = { id: string; code: string; version: number; updated_at: string; content: { title: string; topic?: string } };

export default async function Page() {
  const { data } = await (await supabaseServer()).from("problems").select("id,code,version,updated_at,content").is("deleted_at", null).order("code");
  const rows = (data ?? []) as Row[];
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  return (
    <div className="flex flex-col gap-6">
      <h1>Đề bài</h1>
      <ImportPanel />
      <section aria-labelledby="lst" className="flex flex-col gap-3">
        <h2 id="lst">Đã nạp ({rows.length})</h2>
        {rows.length === 0 ? <Empty text="Chưa có đề nào. Bấm Thêm đề để nạp JSON, dán văn bản hoặc thêm đề mẫu." /> : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium"><span className="tnum text-text-muted">{r.code}</span> {r.content.title}</p>
                  <p className="text-sm text-text-muted">{r.content.topic} · v{r.version} · {fmt.format(new Date(r.updated_at))}</p>
                </div>
                <ProblemActions id={r.id} code={r.code} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
