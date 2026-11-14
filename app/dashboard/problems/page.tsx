import { supabaseServer } from "@/lib/supabase/server";
import { ImportPanel } from "@/components/ProblemTools";
import { ProblemList, type ProblemItem } from "@/components/ProblemList";
import { Badge, Empty } from "@/components/ui";
import { missingInfo, readiness } from "@/lib/ready";
import { ProblemsTabs } from "@/components/ProblemsTabs";
import { BRANCHES, isBranch } from "@/lib/taxonomy";

type Row = { id: string; code: string; version: number; updated_at: string; content: { title: string; statement?: string; grade?: number; topic?: string; branch?: string; solution_steps?: string[] } };

export default async function Page() {
  const sb = await supabaseServer();
  const { data } = await sb.from("problems").select("id,code,version,updated_at,content").is("deleted_at", null).order("code");
  const rows = (data ?? []) as Row[];
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  const rd = rows.map((r) => readiness(r.content));
  const n = (k: "ok" | "bad") => rd.filter((x) => x[k]).length;
  const todo = rd.filter((x) => !x.bad && !x.ok).length; // khớp needsWork: số đề nút "Chuẩn hóa" sẽ làm
  const stat: [string, string, number, boolean][] = [["Đạt chuẩn", `${n("ok")}/${rows.length}`, n("ok"), n("ok") === rows.length], ["Cần hoàn thiện", "", todo, todo === 0], ["Lỗi định dạng", "", n("bad"), n("bad") === 0]];
  const items: ProblemItem[] = rows.map((r, i) => ({
    id: r.id, code: r.code, title: r.content.title, grade: r.content.grade ?? 8, topic: r.content.topic ?? "", branch: isBranch(r.content.branch) ? r.content.branch : undefined, version: r.version, updated: fmt.format(new Date(r.updated_at)),
    unconfirmed: rd[i].unconfirmed, lint: rd[i].lint, needGuides: rd[i].needGuides, pending: rd[i].pending, missing: missingInfo(r.content),
    hay: `${r.code} ${r.content.title} ${r.content.topic ?? ""} lop ${r.content.grade ?? 8} ${isBranch(r.content.branch) ? BRANCHES[r.content.branch] : ""} ${r.content.statement ?? ""}`,
  }));
  const unconfirmed = rd.filter((x) => x.unconfirmed).length;
  if (unconfirmed) stat.splice(1, 0, ["Chưa xác nhận đáp án", "", unconfirmed, false]);
  return (
    <div className="flex flex-col gap-6">
      <h1>Đề bài</h1>
      <ProblemsTabs current="list" />
      <ImportPanel todo={todo} />
      <section aria-labelledby="lst" className="flex flex-col gap-3">
        <h2 id="lst">Đã nạp ({rows.length})</h2>
        {rows.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Trạng thái đề">
            {stat.filter(([k, , v]) => v > 0 || k === "Đạt chuẩn").map(([k, t, v, good]) => <li key={k}><Badge tone={good ? "success" : "warn"}>{k}: {t || v}</Badge></li>)}
          </ul>
        )}
        {rows.length === 0 ? <Empty text="Chưa có đề nào. Bấm Tạo đề mới, sang tab Tạo đề hàng loạt để nạp từ tệp Word, hoặc thêm đề mẫu." /> : (
          <ProblemList items={items} />
        )}
      </section>
    </div>
  );
}
