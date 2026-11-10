"use client";
import { useState } from "react";
import { Empty, LinkButton, toast } from "@/components/ui";
import { group, hour } from "@/components/ActivityLog";
import { ERR_KIND } from "@/lib/log-labels";

type Row = { id: number; ts: string; ref: string; kind: string; where_: string; message: string; stack: string | null; actor: string; meta: Record<string, unknown>; link: string | null; student: string | null };

const WHO: Record<string, string> = { teacher: "Thầy cô", student: "Học sinh", system: "Hệ thống" };

// Chỉ tải khi giáo viên mở mục này lần đầu; đổi bộ lọc hoặc tìm mã lỗi thì tải lại.
export default function ErrorLog() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [kind, setKind] = useState("");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState(false);
  const load = async (k: string, r: string) => {
    setErr(false); setRows(null);
    try {
      const sp = new URLSearchParams();
      if (k) sp.set("kind", k);
      if (r.trim()) sp.set("ref", r.trim());
      const res = await fetch(`/api/errors?${sp}`);
      if (!res.ok) throw new Error();
      setRows((await res.json()).rows);
    } catch { setErr(true); toast("danger", "Không tải được. Đóng rồi mở lại để thử lại."); }
  };
  return (
    <details className="rounded-lg border border-border bg-surface px-4" onToggle={(e) => e.currentTarget.open && !rows && !err && void load(kind, ref)}>
      <summary className="min-h-11 cursor-pointer py-3 text-lg font-bold">Nhật ký lỗi</summary>
      <div className="flex flex-col gap-4 pb-4">
        <p className="text-sm text-text-muted">200 lỗi gần nhất khi hệ thống chạy cho tài khoản và học sinh dùng liên kết của thầy cô. Lỗi được giữ 30 ngày. Học sinh hoặc thầy cô đọc mã lỗi thì gõ vào ô Mã lỗi để tìm.</p>
        <form className="flex flex-wrap items-end justify-between gap-3" onSubmit={(e) => { e.preventDefault(); void load(kind, ref); }}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="err-kind" className="text-sm font-medium">Loại lỗi</label>
              <select id="err-kind" value={kind} onChange={(e) => { setKind(e.target.value); void load(e.target.value, ref); }} className="min-h-11 rounded-sm border border-border-strong bg-surface px-3 text-base">
                <option value="">Tất cả</option>
                {Object.entries(ERR_KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="err-ref" className="text-sm font-medium">Mã lỗi</label>
              <input id="err-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ví dụ 3F9A1C" maxLength={12} className="tnum min-h-11 w-36 rounded-sm border border-border-strong bg-surface px-3 text-base" />
            </div>
            <button type="submit" className="min-h-11 rounded-sm border border-border-strong px-4 font-medium hover:bg-primary-soft">Tìm</button>
          </div>
          <LinkButton variant="secondary" href="/api/export?kind=errors">Tải CSV</LinkButton>
        </form>
        {!rows && !err && <p className="text-sm text-text-muted">Đang tải…</p>}
        {rows && (rows.length === 0 ? <Empty text="Không có lỗi nào khớp. Đó là tin tốt." /> : group(rows).map((g) => (
          <section key={g.key} className="flex flex-col gap-1">
            <h3 className="text-sm font-bold capitalize text-text-muted">{g.title}</h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {g.rows.map((r) => {
                const k = ERR_KIND[r.kind] ?? ERR_KIND.other;
                const where = [WHO[r.actor] ?? r.actor, r.link && `Liên kết «${r.link}»`, r.student && `Học sinh ${r.student}`].filter(Boolean).join(" · ");
                return (
                  <li key={r.id} className="flex gap-3 bg-warning-soft px-4 py-3">
                    <span className="tnum w-12 shrink-0 text-sm text-text-muted">{hour.format(new Date(r.ts))}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium"><span aria-label="Lỗi">⚠ </span>{k.label} <span className="tnum text-sm font-normal text-text-muted">Mã {r.ref}</span></p>
                      <p className="break-anywhere text-sm">{k.hint}</p>
                      <p className="break-anywhere text-sm text-text-muted">{where}</p>
                      <details className="text-sm text-text-muted">
                        <summary className="cursor-pointer">Chi tiết kỹ thuật</summary>
                        <p className="break-anywhere"><b>Nơi xảy ra:</b> {r.where_}</p>
                        <p className="break-anywhere"><b>Thông báo:</b> {r.message}</p>
                        {Object.keys(r.meta).length > 0 && <p className="break-anywhere"><b>Thêm:</b> {JSON.stringify(r.meta)}</p>}
                        {r.stack && <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">{r.stack}</pre>}
                      </details>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )))}
      </div>
    </details>
  );
}
