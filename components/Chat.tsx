"use client";
import { useEffect, useRef, useState } from "react";
import Brand from "@/components/Brand";
import { Alert, Button, Field, post } from "@/components/ui";
import { MathText } from "@/components/MathText";
import FormulaButton from "@/components/FormulaButton";

type P = { id: string; title: string; statement: string; greeting: string };
type M = { role: "student" | "bot"; text: string };
type R = { sessionId?: string; reply?: string; step?: number; done?: boolean };


export default function Chat({ slug, label, problems }: { slug: string; label: string; problems: P[] }) {
  const [prob, setProb] = useState<P | null>(null);
  const [sid, setSid] = useState<string>();
  const [msgs, setMsgs] = useState<M[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [rated, setRated] = useState(false);
  const [sure, setSure] = useState(false); // đã tự đánh giá mức hiểu bài
  const [text, setText] = useState("");
  const [showStmt, setShowStmt] = useState(true); // đề bài ghim phía trên; học sinh có thể thu gọn khi cần thêm chỗ
  const [who, setWho] = useState<{ code: string; name: string } | null>(null); // thông tin học sinh, nhập một lần rồi nhớ trong trình duyệt
  const [ready, setReady] = useState(false);
  const [fCode, setFCode] = useState("");
  const [fName, setFName] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);
  const tok = useRef(0); // mỗi lần mở bài/quay lại tăng 1: phản hồi của lần cũ đến muộn thì bỏ

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  async function start(p: P) {
    const my = ++tok.current;
    setProb(p); setBusy(!p.greeting); setErr("");
    if (p.greeting) setMsgs([{ role: "bot", text: p.greeting }]); // hiện lời chào ngay; server tạo phiên song song, có sid thì mở ô nhập
    const { ok, data } = await post<R>("/api/chat", { action: "start", slug, problemCode: p.id, studentCode: who?.code, studentName: who?.name });
    if (my !== tok.current) return;
    setBusy(false);
    if (!ok) { setErr(data.error ?? "Có lỗi."); started.current = false; setMsgs([]); if (problems.length > 1) setProb(null); return; } // lỗi: bỏ lời chào đã hiện, nhiều đề thì về danh sách (lỗi hiện ở đó)
    setSid(data.sessionId);
    if (!p.greeting) setMsgs([{ role: "bot", text: data.reply ?? "" }]);
  }

  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem("ms_student") ?? "null"); if (v?.code && v?.name) setWho(v); } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (who && problems.length === 1 && !started.current) { started.current = true; start(problems[0]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);

  function saveWho(e: React.FormEvent) {
    e.preventDefault();
    const code = fCode.trim().toUpperCase(), name = fName.trim().replace(/\s+/g, " ");
    if (!/^[A-Z0-9._-]{1,20}$/.test(code)) return setErr("Mã học sinh gồm chữ và số, tối đa 20 ký tự.");
    if (name.length < 2) return setErr("Bạn nhập họ và tên nhé.");
    setErr("");
    const v = { code, name };
    try { localStorage.setItem("ms_student", JSON.stringify(v)); } catch {}
    setWho(v);
  }

  function changeWho() {
    try { localStorage.removeItem("ms_student"); } catch {}
    started.current = false; tok.current++;
    setWho(null); setProb(null); setSid(undefined); setMsgs([]); setDone(false); setRated(false); setSure(false); setErr("");
  }

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
    setProb(null); setSid(undefined); setMsgs([]); setDone(false); setRated(false); setSure(false); setText(""); setErr(""); setBusy(false); setShowStmt(true);
  }

  async function finishNow() {
    if (!sid) return;
    setBusy(true); setErr("");
    const { ok, data } = await post("/api/chat", { action: "end", slug, sessionId: sid });
    setBusy(false);
    if (!ok) return setErr(data.error ?? "Có lỗi.");
    setDone(true);
  }

  async function rateSure(n: number) {
    setSure(true);
    await post("/api/chat", { action: "survey", slug, sessionId: sid, confidence: n });
  }

  async function rate(n: number) {
    setRated(true);
    await post("/api/chat", { action: "survey", slug, sessionId: sid, likert: n });
  }

  if (!ready) return null;
  if (!who) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col gap-4 px-4 py-8">
        <Brand tagline />
        <h1>{label}</h1>
        <p className="text-text-muted">Nhập mã học sinh và họ tên để bắt đầu. Giáo viên sẽ xem kết quả để biết bạn cần hỗ trợ phần nào.</p>
        <form onSubmit={saveWho} className="flex flex-col gap-3">
          <Field label="Mã học sinh" value={fCode} onChange={(e) => setFCode(e.target.value)} maxLength={20} autoComplete="off" required />
          <Field label="Họ và tên" value={fName} onChange={(e) => setFName(e.target.value)} maxLength={60} autoComplete="name" required />
          {err && <Alert tone="danger">{err}</Alert>}
          <Button type="submit" disabled={!fCode.trim() || !fName.trim()}>Tiếp tục</Button>
        </form>
      </main>
    );
  }

  if (!prob && problems.length === 1) return err ? <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col gap-4 px-4 py-8"><Brand tagline /><Alert tone="danger">{err}</Alert><Button variant="secondary" type="button" onClick={changeWho}>Đổi thông tin</Button></main> : null;
  if (!prob) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col gap-4 px-4 py-8">
        <Brand tagline />
        <h1>{label}</h1>
        <p className="text-text-muted">Xin chào <b>{who.name}</b> ({who.code}). Chọn một bài để bắt đầu. Chatbot sẽ gợi ý từng bước, bạn hãy tự suy nghĩ trước khi xin gợi ý.</p>
        <Button variant="ghost" type="button" onClick={changeWho} className="-ml-3 self-start text-sm">Đổi thông tin</Button>
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

      {prob.statement && (
        <section aria-label="Đề bài" className="shrink-0 border-b border-border border-l-4 border-l-primary bg-primary-soft px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">Đề bài</h2>
            <Button variant="ghost" type="button" onClick={() => setShowStmt((v) => !v)} aria-expanded={showStmt} className="-mr-3 text-sm">{showStmt ? "Thu gọn" : "Xem đề"}</Button>
          </div>
          {showStmt && <div className="max-h-[35dvh] overflow-y-auto pb-1 text-base"><MathText text={prob.statement} /></div>}
        </section>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
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
            {!sure && (
              <fieldset>
                <legend className="mb-2 text-sm">Em tự thấy mình hiểu bài này đến đâu? (1 = chưa hiểu, 5 = hiểu rõ)</legend>
                <div className="flex gap-2">{[1, 2, 3, 4, 5].map((n) => <Button key={n} variant="secondary" className="flex-1 px-0" onClick={() => rateSure(n)} aria-label={`${n} điểm`}>{n}</Button>)}</div>
              </fieldset>
            )}
            {rated ? sure && <p className="text-sm text-text-muted">Đã ghi nhận đánh giá của bạn.</p> : (
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
              <textarea id="msg" ref={box} rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={busy || !sid} maxLength={500} placeholder={sid ? "Nhập câu trả lời của bạn. Enter để xuống dòng, bấm Gửi để gửi." : "Đang mở bài, chờ một chút..."} className="min-h-11 flex-1 resize-y rounded-sm border border-border-strong bg-surface px-3 py-2 text-base" />
              <Button type="submit" block={false} disabled={!text.trim() || !sid} pending={busy ? (sid ? "Đang gửi..." : "Đang mở bài...") : undefined}>Gửi</Button>
            </div>
            <p className={`text-right text-xs tnum ${text.length >= 450 ? "text-danger" : "text-text-muted"}`} aria-live="off">{text.length}/500</p>
            {text.includes("$") && <div className="rounded-sm border border-border bg-primary-soft px-3 py-2 text-sm"><span className="block text-xs text-text-muted">Xem trước</span><MathText text={text} /></div>}
            <div className="flex flex-wrap items-center gap-2">
              <FormulaButton target={box} value={text} onChange={setText} disabled={busy || !sid} />
              <Button variant="ghost" type="button" onClick={finishNow} disabled={busy || !sid || msgs.length < 3} className="text-sm">Kết thúc bài</Button>
            </div>
            <p className="text-xs text-text-muted">MathStep AI · Giáo viên xem được bài làm của bạn. Đừng gõ số điện thoại hay email.</p>
          </form>
        )}
      </footer>
    </div>
  );
}
