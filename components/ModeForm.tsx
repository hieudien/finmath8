"use client";
import { useState } from "react";
import { Button, post, toast } from "@/components/ui";
import { MODES, type WorkMode } from "@/lib/modes";

// Chế độ làm bài mặc định cho liên kết MỚI. Mỗi liên kết giữ cố định chế độ lúc tạo, đổi ở đây không ảnh hưởng liên kết đã tạo.
export default function ModeForm({ mode }: { mode: WorkMode }) {
  const [saved, setSaved] = useState(mode);
  const [pick, setPick] = useState(mode);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { ok, data } = await post("/api/settings", { mode: pick });
    setBusy(false);
    if (!ok) return toast("danger", data.error ?? "Có lỗi.");
    setSaved(pick);
    toast("success", `Đã đổi chế độ mặc định cho liên kết mới: ${MODES[pick].label}.`);
  }

  return (
    <form onSubmit={save} className="flex max-w-2xl flex-col gap-3 rounded-lg border border-border bg-surface p-4 md:p-6" aria-labelledby="mode-h">
      <h2 id="mode-h">Chế độ làm bài mặc định cho liên kết mới</h2>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Chế độ làm bài</legend>
        {(Object.keys(MODES) as WorkMode[]).map((k) => (
          <label key={k} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border px-3 py-2 ${pick === k ? "border-primary bg-primary-soft" : "border-border"}`}>
            <input type="radio" name="mode" value={k} checked={pick === k} onChange={() => setPick(k)} className="mt-1 size-4 shrink-0" />
            <span className="flex flex-col">
              <span className="font-medium">{MODES[k].label}</span>
              <span className="text-sm text-text-muted">{MODES[k].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-text-muted">Chỉ áp dụng khi tạo liên kết mới (vẫn chọn lại được lúc tạo). Liên kết đã tạo giữ nguyên chế độ của nó.</p>
      <Button type="submit" disabled={pick === saved} pending={busy ? "Đang lưu..." : undefined} className="self-start">Lưu chế độ</Button>
    </form>
  );
}
