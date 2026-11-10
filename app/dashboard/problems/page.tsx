import { supabaseServer, currentUser } from "@/lib/supabase/server";
import { ImportPanel, ProblemActions } from "@/components/ProblemTools";
import { ExplainButton } from "@/components/ProblemViewTools";
import { Alert, Badge, Empty } from "@/components/ui";
import { teacherMode } from "@/lib/teacher";
import { missingInfo, readiness } from "@/lib/ready";

type Row = { id: string; code: string; version: number; updated_at: string; content: { title: string; topic?: string; solution_steps?: string[] } };

export default async function Page() {
  const stepsMode = (await teacherMode((await currentUser())!.id)) !== "chat";
  const { data } = await (await supabaseServer()).from("problems").select("id,code,version,updated_at,content").is("deleted_at", null).order("code");
  const rows = (data ?? []) as Row[];
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  const rd = rows.map((r) => readiness(r.content));
  const n = (k: "ok" | "needGuides" | "noGreeting" | "pending" | "bad") => rd.filter((x) => x[k]).length;
  const stat: [string, string, number, boolean][] = [["Đạt chuẩn", `${n("ok")}/${rows.length}`, n("ok"), n("ok") === rows.length], ["Cần tạo chỉ dẫn", "", n("needGuides"), n("needGuides") === 0], ["Chưa có lời chào", "", n("noGreeting"), n("noGreeting") === 0], ["Chờ duyệt", "", n("pending"), n("pending") === 0], ["Lỗi định dạng", "", n("bad"), n("bad") === 0]];
  return (
    <div className="flex flex-col gap-6">
      <h1>Đề bài</h1>
      <ImportPanel stepsMode={stepsMode} />
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
                  <p className="truncate font-medium" title={`${r.code} ${r.content.title}`}><span className="tnum text-text-muted">{r.code}</span> {r.content.title}</p>
                  <p className="truncate text-sm text-text-muted">{r.content.topic} · v{r.version} · {fmt.format(new Date(r.updated_at))}</p>
                </div>
                <ProblemActions id={r.id} />
                {(rd[i].needGuides || rd[i].noGreeting || rd[i].pending) && (
                  <div className="flex basis-full flex-wrap gap-1">
                    {rd[i].needGuides && <Badge tone="warn">Thiếu chỉ dẫn</Badge>}
                    {rd[i].noGreeting && <Badge tone="warn">Chưa có lời chào</Badge>}
                    {rd[i].pending && <Badge tone="warn">Chờ duyệt</Badge>}
                  </div>
                )}
                {missingInfo(r.content).length > 0 && (
                  <div className="flex basis-full flex-col gap-2">
                    <Alert tone="warning">Thiếu {missingInfo(r.content).join(", ")}, nên chưa tạo được liên kết với đề này. Liên kết đã tạo trước đó giữ đề cũ: tạo liên kết mới sau khi bổ sung.</Alert>
                    <ExplainButton id={r.id} action="fill" label="Nạp thêm bằng AI" busyLabel="AI đang nạp thêm..." />
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
