"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Confirm, CopyButton, Field, post, useRefresh } from "@/components/ui";

import { ExplainButton } from "@/components/ProblemViewTools";

type P = { id: string; code: string; title: string; missing: string[] };

export function CreateLink({ problems }: { problems: P[] }) {
  const [rp, refresh] = useRefresh();
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState(false);
  // Đóng form khi liên kết mới đã hiện trong danh sách.
  useEffect(() => { if (created && !rp) { setCreated(false); setOpen(false); } }, [created, rp]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr("");
    const { ok, data } = await post("/api/links", { action: "create", label: f.get("label"), tag: f.get("tag") || null, problemIds: sel, maxMessages: Number(f.get("max")) });
    setBusy(false);
    if (!ok) return setErr(data.error ?? "Có lỗi.");
    setSel([]); (e.target as HTMLFormElement).reset(); setCreated(true); refresh();
  }

  if (!open) return <Button onClick={() => setOpen(true)} className="self-start">Thêm liên kết</Button>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2>Tạo liên kết mới</h2>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Đóng</Button>
      </div>
      <Field label="Tên liên kết" name="label" required placeholder="Ví dụ: Lớp 8A, tiết 12" hint="Chỉ giáo viên thấy tên này." />
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-medium">Chọn đề cho học sinh</legend>
        {problems.map((p) => (
          <div key={p.id} className="flex flex-col gap-2">
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="size-5 accent-[var(--color-primary)]" disabled={p.missing.length > 0} checked={sel.includes(p.id)} onChange={(e) => setSel((s) => e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id))} />
              <span><span className="tnum text-text-muted">{p.code}</span> {p.title}</span>
            </label>
            {p.missing.length > 0 && (
              <div className="ml-8 flex flex-col gap-2">
                <Alert tone="warning">Chưa tạo liên kết được với đề này: thiếu {p.missing.join(", ")}. Đề cần đủ để dùng cho cả chat và từng bước.</Alert>
                <ExplainButton id={p.id} action="fill" label="Nạp thêm bằng AI" busyLabel="AI đang nạp thêm..." />
              </div>
            )}
          </div>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="tag" className="font-medium">Nhóm nghiên cứu (tùy chọn)</label>
          <select id="tag" name="tag" className="min-h-11 rounded-sm border border-border-strong bg-surface px-3 text-base">
            <option value="">Không gắn nhóm</option>
            <option value="pre">Kiểm tra trước (pre)</option>
            <option value="post">Kiểm tra sau (post)</option>
            <option value="experiment">Nhóm thực nghiệm</option>
            <option value="control">Nhóm đối chứng</option>
          </select>
        </div>
        <Field label="Số tin tối đa mỗi phiên" name="max" type="number" inputMode="numeric" min={5} max={200} defaultValue={40} required />
      </div>
      {err && <Alert tone="danger">{err}</Alert>}
      <Button type="submit" disabled={!sel.length} pending={busy || rp ? "Đang tạo..." : undefined} className="self-start">Tạo liên kết công khai</Button>
    </form>
  );
}

export function LinkActions({ id, slug, active }: { id: string; slug: string; active: boolean }) {
  const [rp, refresh] = useRefresh();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/c/${slug}`;
  async function toggle() {
    setBusy(true); setErr("");
    const { ok, data } = await post("/api/links", { action: "toggle", id, active: !active });
    setBusy(false);
    if (ok) refresh(); else setErr(data.error ?? "Có lỗi.");
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={url || `/c/${slug}`} />
        <Button variant="secondary" onClick={toggle} pending={busy || rp ? (active ? "Đang tắt..." : "Đang bật...") : undefined}>{active ? "Tắt" : "Bật"}</Button>
        <Confirm label="Xóa liên kết" message="Học sinh không vào được nữa. Toàn bộ phiên chat và thống kê của liên kết này bị xóa vĩnh viễn." onConfirm={async () => { const { ok, data } = await post("/api/links", { action: "delete", id }); if (!ok) return data.error ?? "Có lỗi."; }} />
      </div>
      {err && <Alert tone="danger">{err}</Alert>}
    </div>
  );
}
