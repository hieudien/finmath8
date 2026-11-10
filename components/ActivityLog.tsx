"use client";
import { useState } from "react";
import { Empty, LinkButton, toast } from "@/components/ui";
import { describe, GROUPS, LOG, labelOf, type Meta } from "@/lib/log-labels";

type Row = { id: number; ts: string; actor_type: string; action: string; meta: Meta; link: string | null; student: string | null };

const TZ = "Asia/Ho_Chi_Minh";
const day = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }); // yyyy-mm-dd, tiện so sánh và nhóm
const dayLabel = new Intl.DateTimeFormat("vi-VN", { dateStyle: "full", timeZone: TZ });
export const hour = new Intl.DateTimeFormat("vi-VN", { timeStyle: "short", timeZone: TZ });

const WHO: Record<string, string> = { teacher: "Thầy cô", student: "Học sinh", system: "Hệ thống" };

export function group<T extends { ts: string }>(rows: T[]) {
  const today = day.format(new Date()), yest = day.format(new Date(Date.now() - 864e5));
  const out: { key: string; title: string; rows: T[] }[] = [];
  for (const r of rows) {
    const d = new Date(r.ts), k = day.format(d);
    if (out.at(-1)?.key !== k) out.push({ key: k, title: k === today ? "Hôm nay" : k === yest ? "Hôm qua" : dayLabel.format(d), rows: [] });
    out.at(-1)!.rows.push(r);
  }
  return out;
}

// Chỉ tải nhật ký khi giáo viên mở mục này lần đầu; đổi bộ lọc thì tải lại.
export default function ActivityLog() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [action, setAction] = useState("");
  const [err, setErr] = useState(false);
  const load = async (a: string) => {
    setErr(false); setRows(null);
    try {
      const r = await fetch(`/api/logs${a ? `?action=${encodeURIComponent(a)}` : ""}`);
      if (!r.ok) throw new Error();
      setRows((await r.json()).rows);
    } catch { setErr(true); toast("danger", "Không tải được. Đóng rồi mở lại để thử lại."); }
  };
  return (
    <details className="rounded-lg border border-border bg-surface px-4" onToggle={(e) => e.currentTarget.open && !rows && !err && void load(action)}>
      <summary className="min-h-11 cursor-pointer py-3 text-lg font-bold">Nhật ký hoạt động</summary>
      <div className="flex flex-col gap-4 pb-4">
        <p className="text-sm text-text-muted">200 hoạt động gần nhất của tài khoản và học sinh dùng liên kết của thầy cô.</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="action" className="text-sm font-medium">Xem</label>
            <select id="action" value={action} onChange={(e) => { setAction(e.target.value); void load(e.target.value); }} className="min-h-11 rounded-sm border border-border-strong bg-surface px-3 text-base">
              <option value="">Tất cả</option>
              <option value="warn">Cần chú ý (lỗi, dấu hiệu cần hỗ trợ, lộ đáp án...)</option>
              {GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {Object.entries(LOG).filter(([, v]) => v.group === g).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <LinkButton variant="secondary" href="/api/export?kind=logs">Tải CSV</LinkButton>
        </div>
        {!rows && !err && <p className="text-sm text-text-muted">Đang tải…</p>}
        {rows && (rows.length === 0 ? <Empty text="Chưa có hoạt động nào khớp." /> : group(rows).map((g) => (
          <section key={g.key} className="flex flex-col gap-1">
            <h3 className="text-sm font-bold capitalize text-text-muted">{g.title}</h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {g.rows.map((r) => {
                const warn = LOG[r.action]?.warn, text = describe(r.action, r.meta);
                const where = [r.link && `Liên kết «${r.link}»`, r.student && `Học sinh ${r.student}`].filter(Boolean).join(" · ");
                return (
                  <li key={r.id} className={`flex gap-3 px-4 py-3 ${warn ? "bg-warning-soft" : ""}`}>
                    <span className="tnum w-12 shrink-0 text-sm text-text-muted">{hour.format(new Date(r.ts))}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{warn && <span aria-label="Cần chú ý">⚠ </span>}{labelOf(r.action)}</p>
                      {text && <p className="break-anywhere text-sm">{text}</p>}
                      <p className="break-anywhere text-sm text-text-muted">{[WHO[r.actor_type] ?? r.actor_type, where].filter(Boolean).join(" · ")}</p>
                      {r.action === "error" && (
                        <details className="text-sm text-text-muted">
                          <summary className="cursor-pointer">Chi tiết kỹ thuật</summary>
                          <p className="break-anywhere">{JSON.stringify(r.meta)}</p>
                        </details>
                      )}
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
