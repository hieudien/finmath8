"use client";
import { useState } from "react";
import { AiBadge, Button, Field, post, toast } from "@/components/ui";
import { PROVIDERS, type Provider } from "@/lib/models";

type Props = { provider: Provider; last4: Record<Provider, string | null> };

const RADIO = "mt-1 size-5 shrink-0 accent-[var(--color-primary)]";

export default function SettingsForm(props: Props) {
  const [provider, setProvider] = useState<Provider>(props.provider);
  const [tails, setTails] = useState(props.last4);
  const [busy, setBusy] = useState(false);
  const info = PROVIDERS[provider];

  function pickProvider(p: Provider) {
    setProvider(p);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    const key = String(f.get("key") ?? "").trim();
    const { ok, data } = await post<{ last4?: string }>("/api/settings", { provider, key: key || undefined });
    setBusy(false);
    if (!ok) return toast("danger", data.error ?? "Có lỗi.");
    if (data.last4) setTails((t) => ({ ...t, [provider]: data.last4! }));
    form.reset();
    toast("success", `Đã lưu. Chatbot dùng ${info.label}.`);
  }

  return (
    <details aria-labelledby="key-setup" className="group rounded-lg border border-border bg-surface p-4 md:p-6">
    <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
      <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-1.5 size-5 shrink-0 text-text-muted transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4l6 6-6 6" /></svg>
      <span className="flex min-w-0 flex-col gap-1">
        <h2 id="key-setup" className="inline">Nhà cung cấp AI và API key</h2>
        <span className="text-sm font-normal text-text-muted">Đang dùng {info.label}: {tails[provider] ? `đã lưu key (…${tails[provider]})` : "chưa có key"}.</span>
      </span>
    </summary>
    <form onSubmit={submit} className="mt-3 flex max-w-2xl flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Nhà cung cấp AI</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
            <label key={p} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border px-3 py-3 ${provider === p ? "border-primary bg-primary-soft" : "border-border-strong bg-surface"}`}>
              <input type="radio" name="provider" className={RADIO} checked={provider === p} onChange={() => pickProvider(p)} />
              <span>
                <span className="block font-medium">{PROVIDERS[p].label}</span>
                <span className="block text-sm text-text-muted">{tails[p] ? `Đã lưu key (…${tails[p]})` : "Chưa có key"}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="flex flex-col gap-3" aria-labelledby="key-h">
        <h2 id="key-h">API key của {info.label}</h2>
        <details className="rounded-sm border border-border bg-surface px-3 py-2">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">Cách lấy API key</summary>
          <ol className="list-decimal space-y-1 pb-2 pl-5">
            {info.keySteps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <p><a href={info.keyUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-primary underline">Mở trang lấy key của {info.label}</a></p>
          <p className="pb-2 text-sm text-text-muted">{info.keyNote}</p>
        </details>
        <Field label="API key" name="key" type="password" autoComplete="off" placeholder={tails[provider] ? `Đã lưu (…${tails[provider]}). Nhập key mới để thay.` : "Dán key vào đây"} hint="Key được mã hóa trên máy chủ và không hiển thị lại. Học sinh chat bằng key này." />
      </section>

      <Button type="submit" pending={busy ? "Đang kiểm tra key..." : undefined} className="self-start">Lưu cài đặt <AiBadge /></Button>
    </form>
    </details>
  );
}
