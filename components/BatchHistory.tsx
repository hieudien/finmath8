import { Badge, Empty } from "@/components/ui";
import { summary, type BatchItem, type BatchStatus, type Fail, type ItemStatus } from "@/lib/import-batch";

export type HistoryRow = { id: string; created_at: string; confirmed_at: string | null; file_name: string; grade: number; status: BatchStatus; sources: number; read_errors: Fail[]; items: BatchItem[] };

const ST: Record<BatchStatus, { tone: "warn" | "success" | "neutral"; text: string }> = { draft: { tone: "warn", text: "Bản nháp" }, confirmed: { tone: "success", text: "Đã lưu" }, cancelled: { tone: "neutral", text: "Đã hủy" } };
const IT: Record<ItemStatus, string> = { ok: "Đạt chuẩn", review: "Cần xem lại", failed: "Lỗi", drafted: "Chưa viết lời giải", pending: "Chưa làm" };

// Lịch sử các đợt tạo đề hàng loạt (đợt nháp đang mở thì xử lý ngay phía trên, không phải ở đây).
export function BatchHistory({ rows }: { rows: HistoryRow[] }) {
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  if (rows.length === 0) return <Empty text="Chưa có đợt nào. Chọn tệp Word ở trên để tạo đề hàng loạt." />;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {rows.map((r) => {
        const s = summary(r.items), bad = r.items.filter((it) => it.status === "failed");
        return (
          <li key={r.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{r.file_name || "Tệp Word"}</span>
              <Badge tone="info">Lớp {r.grade}</Badge>
              <Badge tone={ST[r.status].tone}>{ST[r.status].text}</Badge>
            </div>
            <p className="text-sm text-text-muted">
              {fmt.format(new Date(r.created_at))}{r.confirmed_at ? ` · lưu lúc ${fmt.format(new Date(r.confirmed_at))}` : ""} · đọc {r.sources} nguồn · {s.found} đề ({s.withAnswer} có đáp số sẵn) · {s.ok} đạt chuẩn, {s.review} cần xem lại, {s.failed} lỗi{s.pending ? `, ${s.pending} chưa làm xong` : ""}{r.status === "confirmed" ? ` · đã lưu ${s.saved} đề` : ""}
            </p>
            {(bad.length > 0 || r.read_errors.length > 0 || s.review > 0) && (
              <details className="text-sm">
                <summary className="cursor-pointer text-primary">Chi tiết lỗi và cảnh báo</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {r.read_errors.map((e, k) => <li key={"r" + k}><strong>Đọc tệp, {e.name}</strong>: {e.reason}</li>)}
                  {r.items.flatMap((it, i) => (it.status === "failed" || it.status === "review" ? [<li key={"i" + i}><strong>Đề {i + 1}</strong> ({IT[it.status]}{it.code ? `, mã ${it.code}` : ""}): {it.reason || "không rõ lý do"} <span className="text-text-muted">· {it.statement.slice(0, 60)}...</span></li>] : []))}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
