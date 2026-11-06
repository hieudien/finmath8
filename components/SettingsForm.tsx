"use client";
import { useState } from "react";
import { Alert, Button, Field, post } from "@/components/ui";
import { PROVIDERS, type Provider } from "@/lib/models";

type Props = { provider: Provider; model: string; temperature: number; last4: Record<Provider, string | null> };

const RADIO = "mt-1 size-5 shrink-0 accent-[var(--color-primary)]";

export default function SettingsForm(props: Props) {
  const [provider, setProvider] = useState<Provider>(props.provider);
  const [model, setModel] = useState(props.model);
  const [custom, setCustom] = useState(() => !PROVIDERS[props.provider].models.some((m) => m.id === props.model));
  const [tails, setTails] = useState(props.last4);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const info = PROVIDERS[provider];

  function pickProvider(p: Provider) {
    setProvider(p);
    setCustom(false);
    setModel(p === props.provider && PROVIDERS[p].models.some((m) => m.id === props.model) ? props.model : PROVIDERS[p].defaultModel);
    setMsg(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setMsg(null);
    const key = String(f.get("key") ?? "").trim();
    const { ok, data } = await post<{ last4?: string }>("/api/settings", { provider, key: key || undefined, model: model.trim(), temperature: Number(f.get("temperature") ?? 0.3) });
    setBusy(false);
    if (!ok) return setMsg({ tone: "danger", text: data.error ?? "Có lỗi." });
    if (data.last4) setTails((t) => ({ ...t, [provider]: data.last4! }));
    form.reset();
    setMsg({ tone: "success", text: `Đã lưu. Chatbot dùng ${info.label}, model ${model}.` });
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6">
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

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Model</legend>
        <p className="mb-1 text-sm text-text-muted">Khi model này hết lượt dùng, hệ thống tự đổi sang model kế tiếp trong danh sách của cùng nhà cung cấp và thử lại. Việc đổi được ghi ở trang Nhật ký.</p>
        {info.models.map((m) => (
          <label key={m.id} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border px-3 py-3 ${!custom && model === m.id ? "border-primary bg-primary-soft" : "border-border"}`}>
            <input type="radio" name="model" className={RADIO} checked={!custom && model === m.id} onChange={() => { setCustom(false); setModel(m.id); }} />
            <span>
              <span className="block font-medium">{m.name} <span className="text-sm font-normal text-text-muted">({m.id})</span>{m.id === info.defaultModel && <span className="ml-2 text-sm text-primary">Mặc định</span>}</span>
              <span className="block text-sm text-text-muted">{m.desc}</span>
            </span>
          </label>
        ))}
        <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border px-3 py-3 ${custom ? "border-primary bg-primary-soft" : "border-border"}`}>
          <input type="radio" name="model" className={RADIO} checked={custom} onChange={() => { setCustom(true); setModel(""); }} />
          <span className="block font-medium">Model khác <span className="text-sm font-normal text-text-muted">(nhập tên chính xác theo tài liệu của hãng)</span></span>
        </label>
        {custom && <Field label="Tên model" name="custom_model" value={model} onChange={(e) => setModel(e.target.value)} required placeholder={info.defaultModel} />}
      </fieldset>

      {provider === "gemini" ? (
        <Field label="Nhiệt độ (0 đến 1)" name="temperature" type="number" inputMode="decimal" step="0.1" min="0" max="1" defaultValue={props.temperature} hint="Thấp hơn thì chatbot ổn định hơn. Khuyến nghị 0.3." />
      ) : (
        <Alert tone="info">OpenAI dùng nhiệt độ mặc định của model, không chỉnh được ở đây.</Alert>
      )}

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button type="submit" disabled={!model.trim()} pending={busy ? "Đang kiểm tra key..." : undefined} className="self-start">Lưu cài đặt</Button>
    </form>
  );
}
