"use client";
import { useEffect, useRef, useState } from "react";
import Brand from "@/components/Brand";
import { Alert, Button, post } from "@/components/ui";

type P = { id: string; title: string; statement: string };
type M = { role: "student" | "bot"; text: string };
type R = { sessionId?: string; reply?: string; step?: number; done?: boolean };

const STEPS = ["Khám phá", "Phân tích", "Đề xuất", "Thực hiện", "Đánh giá"];

export default function Chat({ slug, label, problems }: { slug: string; label: string; problems: P[] }) {
  const [prob, setProb] = useState<P | null>(problems.length === 1 ? problems[0] : null);
  const [sid, setSid] = useState<string>();
  const [msgs, setMsgs] = useState<M[]>([]);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [rated, setRated] = useState(false);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  async function start(p: P) {
    setProb(p); setBusy(true); setErr("");
    const { ok, data } = await post<R>("/api/chat", { action: "start", slug, problemCode: p.id });
    setBusy(false);
    if (!ok) { setErr(data.error ?? "Có lỗi."); started.current = false; return; }
    setSid(data.sessionId); setStep(data.step ?? 1);
    setMsgs([{ role: "bot", text: data.reply ?? "" }]);
  }

  useEffect(() => {
    if (problems.length === 1 && !started.current) { started.current = true; start(problems[0]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !sid || busy) return;
    setText(""); setErr(""); setBusy(true);
    setMsgs((m) => [...m, { role: "student", text: t }]);
    const { ok, data } = await post<R>("/api/chat", { action: "message", slug, sessionId: sid, text: t });
    setBusy(false);
    if (!ok) return setErr(data.error ?? "Có lỗi.");
    setStep(data.step ?? step);
    setMsgs((m) => [...m, { role: "bot", text: data.reply ?? "" }]);
    if (data.done) setDone(true);
  }

  async function finishNow() {
    if (!sid) return;
    setBusy(true); setErr("");
    const { ok, data } = await post("/api/chat", { action: "end", slug, sessionId: sid });
    setBusy(false);
    if (!ok) return setErr(data.error ?? "Có lỗi.");
    setDone(true);
  }

  async function rate(n: number) {
    setRated(true);
    await post("/api/chat", { action: "survey", slug, sessionId: sid, likert: n });
  }

  if (!prob) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col gap-4 px-4 py-8">
        <Brand tagline />
        <h1>{label}</h1>
        <p className="text-text-muted">Chọn một bài để bắt đầu. Chatbot sẽ gợi ý từng bước, em hãy tự suy nghĩ trước khi xin gợi ý.</p>
        <ul className="flex flex-col gap-2">
          {problems.map((p) => (
            <li key={p.id}>
              <button onClick={() => start(p)} className="min-h-11 w-full rounded-sm border border-border-strong bg-surface px-4 py-3 text-left hover:bg-primary-soft">
                <span className="font-medium">{p.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <div className="h-screen-d mx-auto flex max-w-2xl flex-col">
      <header className="border-b border-border bg-surface px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <Brand size="sm" />
          <p className="truncate text-sm text-text-muted" title={label}>{label}</p>
        </div>
        <h1 className="text-lg">{prob.title}</h1>
        <ol className="mt-2 flex gap-1 text-xs" aria-label="Các bước giải bài">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i + 1 === step ? "step" : undefined} className={`flex-1 rounded-sm px-1 py-1 text-center ${i + 1 === step ? "bg-primary text-on-primary font-medium" : i + 1 < step ? "bg-primary-soft text-primary" : "bg-border text-text-muted"}`}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
        {prob.statement && <p className="mb-4 rounded-sm border border-border bg-surface px-3 py-2 text-sm">{prob.statement}</p>}
        <ul className="flex flex-col gap-3">
          {msgs.map((m, i) => (
            <li key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 ${m.role === "bot" ? "self-start bg-surface border border-border" : "self-end bg-primary text-on-primary"}`}>
              <span className="sr-only">{m.role === "bot" ? "Chatbot: " : "Em: "}</span>{m.text}
            </li>
          ))}
          {busy && <li className="self-start"><div className="skeleton h-9 w-40" aria-label={sid ? "Chatbot đang trả lời" : "Đang mở bài"} /></li>}
        </ul>
        <div ref={end} />
      </div>

      <footer className="border-t border-border bg-surface px-4 pt-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        {err && <div className="mb-2"><Alert tone="danger">{err}</Alert></div>}
        {done ? (
          <div className="flex flex-col gap-3">
            <Alert tone="success">Em đã hoàn thành bài. Cảm ơn em.</Alert>
            {rated ? <p className="text-sm text-text-muted">Đã ghi nhận đánh giá ẩn danh của em.</p> : (
              <fieldset>
                <legend className="mb-2 text-sm">Chatbot giúp em giải bài tốt hơn? (1 = không, 5 = rất nhiều)</legend>
                <div className="flex gap-2">{[1, 2, 3, 4, 5].map((n) => <Button key={n} variant="secondary" className="flex-1 px-0" onClick={() => rate(n)} aria-label={`${n} điểm`}>{n}</Button>)}</div>
              </fieldset>
            )}
          </div>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-2">
            <label htmlFor="msg" className="sr-only">Câu trả lời của em</label>
            <div className="flex items-end gap-2">
              <textarea id="msg" rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={busy || !sid} maxLength={1000} placeholder={sid ? "Nhập câu trả lời của em. Enter để xuống dòng, bấm Gửi để gửi." : "Đang mở bài, chờ một chút..."} className="min-h-11 flex-1 resize-y rounded-sm border border-border-strong bg-surface px-3 py-2 text-base" />
              <Button type="submit" disabled={!text.trim() || !sid} pending={busy ? (sid ? "Đang gửi..." : "Đang mở bài...") : undefined}>Gửi</Button>
            </div>
            <Button variant="ghost" type="button" onClick={finishNow} disabled={busy || !sid || msgs.length < 3} className="self-start text-sm">Kết thúc bài</Button>
            <p className="text-xs text-text-muted">FinMath 8 · Ẩn danh: đừng gõ tên, lớp, trường hay số điện thoại.</p>
          </form>
        )}
      </footer>
    </div>
  );
}
