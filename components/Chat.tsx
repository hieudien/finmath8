"use client";
import { useEffect, useRef, useState } from "react";
import Brand from "@/components/Brand";
import { Alert, Button, post } from "@/components/ui";
import { MathText } from "@/components/MathText";

type P = { id: string; title: string; statement: string; greeting: string };
type M = { role: "student" | "bot"; text: string };
type R = { sessionId?: string; reply?: string; step?: number; done?: boolean };


export default function Chat({ slug, label, problems }: { slug: string; label: string; problems: P[] }) {
  const [prob, setProb] = useState<P | null>(problems.length === 1 ? problems[0] : null);
  const [sid, setSid] = useState<string>();
  const [msgs, setMsgs] = useState<M[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [rated, setRated] = useState(false);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const tok = useRef(0); // mỗi lần mở bài/quay lại tăng 1: phản hồi của lần cũ đến muộn thì bỏ

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  async function start(p: P) {
    const my = ++tok.current;
    setProb(p); setBusy(!p.greeting); setErr("");
    if (p.greeting) setMsgs([{ role: "bot", text: p.greeting }]); // hiện lời chào ngay; server tạo phiên song song, có sid thì mở ô nhập
    const { ok, data } = await post<R>("/api/chat", { action: "start", slug, problemCode: p.id });
    if (my !== tok.current) return;
    setBusy(false);
    if (!ok) { setErr(data.error ?? "Có lỗi."); started.current = false; setMsgs([]); if (problems.length > 1) setProb(null); return; } // lỗi: bỏ lời chào đã hiện, nhiều đề thì về danh sách (lỗi hiện ở đó)
    setSid(data.sessionId);
    if (!p.greeting) setMsgs([{ role: "bot", text: data.reply ?? "" }]);
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
    if (!ok) { setMsgs((m) => m.slice(0, -1)); setText(t); return setErr(data.error ?? "Có lỗi. Bạn thử gửi lại nhé."); } // trả tin về ô nhập để không mất
    setMsgs((m) => [...m, { role: "bot", text: data.reply ?? "" }]);
    if (data.done) setDone(true);
  }

  // Quay lại danh sách đề. Phiên đang làm dở để nguyên ("Bỏ dở"), giống khi học sinh đóng tab.
  function back() {
    tok.current++;
    setProb(null); setSid(undefined); setMsgs([]); setDone(false); setRated(false); setText(""); setErr(""); setBusy(false);
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
        {err && <Alert tone="danger">{err}</Alert>}
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
        {problems.length > 1 && <Button variant="ghost" type="button" onClick={back} className="mt-1 -ml-3 text-sm">← Danh sách đề</Button>}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
        {prob.statement && <p className="mb-4 rounded-sm border border-border bg-surface px-3 py-2 text-sm"><MathText text={prob.statement} /></p>}
        <ul className="flex flex-col gap-3">
          {msgs.map((m, i) => (
            <li key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 ${m.role === "bot" ? "self-start bg-surface border border-border" : "self-end bg-primary text-on-primary"}`}>
              <span className="sr-only">{m.role === "bot" ? "Chatbot: " : "Em: "}</span><MathText text={m.text} />
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
              <textarea id="msg" rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={busy || !sid} maxLength={300} placeholder={sid ? "Nhập câu trả lời của bạn. Enter để xuống dòng, bấm Gửi để gửi." : "Đang mở bài, chờ một chút..."} className="min-h-11 flex-1 resize-y rounded-sm border border-border-strong bg-surface px-3 py-2 text-base" />
              <Button type="submit" disabled={!text.trim() || !sid} pending={busy ? (sid ? "Đang gửi..." : "Đang mở bài...") : undefined}>Gửi</Button>
            </div>
            <p className={`text-right text-xs tnum ${text.length >= 270 ? "text-danger" : "text-text-muted"}`} aria-live="off">{text.length}/300</p>
            <Button variant="ghost" type="button" onClick={finishNow} disabled={busy || !sid || msgs.length < 3} className="self-start text-sm">Kết thúc bài</Button>
            <p className="text-xs text-text-muted">FinMath 8 · Ẩn danh: đừng gõ tên, lớp, trường hay số điện thoại.</p>
          </form>
        )}
      </footer>
    </div>
  );
}
