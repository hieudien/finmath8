"use client";
import { useState } from "react";
import { Alert, Button, post } from "@/components/ui";
import { MODES, type Mode } from "@/lib/modes";

const RADIO = "mt-1 size-5 shrink-0 accent-[var(--color-primary)]";

export default function ModeForm({ mode }: { mode: Mode }) {
  const [cur, setCur] = useState<Mode>(mode);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { ok, data } = await post("/api/settings", { mode: cur });
    setBusy(false);
    setMsg(ok ? { tone: "success", text: `Đã lưu. Học sinh mở liên kết sẽ thấy kiểu "${MODES[cur].label}".` } : { tone: "danger", text: data.error ?? "Có lỗi." });
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Cách học sinh làm bài</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <label key={m} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border px-3 py-3 ${cur === m ? "border-primary bg-primary-soft" : "border-border-strong bg-surface"}`}>
              <input type="radio" name="mode" className={RADIO} checked={cur === m} onChange={() => { setCur(m); setMsg(null); }} />
              <span>
                <span className="block font-medium">{MODES[m].label}</span>
                <span className="block text-sm text-text-muted">{MODES[m].desc}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button type="submit" pending={busy ? "Đang lưu..." : undefined} className="self-start">Lưu cách làm bài</Button>
    </form>
  );
}
