import { supabaseServer } from "@/lib/supabase/server";
import { ImportPanel, ProblemActions } from "@/components/ProblemTools";
import { ExplainButton } from "@/components/ProblemViewTools";
import { Alert, Badge, Empty } from "@/components/ui";
import { missingInfo, readiness } from "@/lib/ready";

type Row = { id: string; code: string; version: number; updated_at: string; content: { title: string; grade?: number; topic?: string; solution_steps?: string[] } };

export default async function Page() {
  const { data } = await (await supabaseServer()).from("problems").select("id,code,version,updated_at,content").is("deleted_at", null).order("code");
  const rows = (data ?? []) as Row[];
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  const rd = rows.map((r) => readiness(r.content));
  const n = (k: "ok" | "bad") => rd.filter((x) => x[k]).length;
  const todo = rd.filter((x) => !x.bad && !x.ok).length; // khớp needsWork: số đề nút "Chuẩn hóa" sẽ làm
  const stat: [string, string, number, boolean][] = [["Đạt chuẩn", `${n("ok")}/${rows.length}`, n("ok"), n("ok") === rows.length], ["Cần hoàn thiện", "", todo, todo === 0], ["Lỗi định dạng", "", n("bad"), n("bad") === 0]];
  const unconfirmed = rd.filter((x) => x.unconfirmed).length;
  if (unconfirmed) stat.splice(1, 0, ["Chưa xác nhận đáp án", "", unconfirmed, false]);
  return (
    <div className="flex flex-col gap-6">
      <h1>Đề bài</h1>
      <ImportPanel todo={todo} />
      <section aria-labelledby="lst" className="flex flex-col gap-3">
        <h2 id="lst">Đã nạp ({rows.length})</h2>
        {rows.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Trạng thái đề">
            {stat.filter(([k, , v]) => v > 0 || k === "Đạt chuẩn").map(([k, t, v, good]) => <li key={k}><Badge tone={good ? "success" : "warn"}>{k}: {t || v}</Badge></li>)}
          </ul>
        )}
        {rows.length === 0 ? <Empty text="Chưa có đề nào. Bấm Thêm đề để nạp JSON, dán văn bản hoặc thêm đề mẫu." /> : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {rows.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <div className="w-96 max-w-full shrink-0">
                  <div className="flex items-center gap-2" title={`${r.code} ${r.content.title}`}>
                    <p className="min-w-0 truncate font-medium"><span className="tnum text-text-muted">{r.code}</span> {r.content.title}</p>
                    <span className="shrink-0"><Badge tone="info">Lớp {r.content.grade ?? 8}</Badge></span>
                    {rd[i].unconfirmed && <span className="shrink-0"><Badge tone="warn">Chưa xác nhận đáp án</Badge></span>}
                  </div>
                  <p className="truncate text-sm text-text-muted">{r.content.topic} · v{r.version} · {fmt.format(new Date(r.updated_at))}</p>
                </div>
                <ProblemActions id={r.id} />
                {(rd[i].needGuides || rd[i].pending || rd[i].lint.length > 0) && (
                  <div className="flex basis-full flex-wrap gap-1">
                    {rd[i].lint.length > 0 && <Badge tone="warn"><span title={rd[i].lint.join("\n")}>Cần xem lại ({rd[i].lint.length})</span></Badge>}
                    {rd[i].needGuides && <Badge tone="warn">Thiếu chỉ dẫn</Badge>}
                    {rd[i].pending && <Badge tone="warn">Chưa hoàn thiện</Badge>}
                  </div>
                )}
                {missingInfo(r.content).length > 0 && (
                  <div className="flex basis-full flex-col gap-2">
                    <Alert tone="warning">Thiếu {missingInfo(r.content).join(", ")}, nên chưa tạo được liên kết với đề này. Liên kết đã tạo trước đó giữ đề cũ: tạo liên kết mới sau khi bổ sung.</Alert>
                    <ExplainButton id={r.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
