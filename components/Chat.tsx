"use client";
import { useEffect, useRef, useState } from "react";
import Brand from "@/components/Brand";
import { Alert, Button, Field, post } from "@/components/ui";
import { MathText } from "@/components/MathText";
import { INPUTS } from "@/components/ChatInputs";
import type { Mode } from "@/lib/modes";
import { shortId } from "@/lib/sid";

type P = { id: string; title: string; statement: string; greeting: string; mode: Mode; total: number; goal: string; options?: string[] };
type M = { role: "student" | "bot"; text: string };
type Prog = { done: number; total: number; next?: number; goal?: string; options?: string[] };
type R = { sessionId?: string; reply?: string; step?: number; done?: boolean; mode?: Mode; progress?: Prog; ok?: boolean };


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
  const [smode, setSmode] = useState<Mode | null>(null); // kiểu server chốt cho phiên (khác dự đoán của trang khi giáo viên vừa đổi cài đặt)
  const [prog, setProg] = useState<Prog | null>(null);
  const [asking, setAsking] = useState(false); // kiểu từng bước: ô đang dùng để hỏi "Em chưa hiểu"
  const [wrong, setWrong] = useState(0); // kiểu từng bước: số lần nộp liên tiếp chưa qua bước, từ 2 thì nhắc bấm Gợi ý
  const [tried, setTried] = useState<string[]>([]); // kiểu trắc nghiệm: các đáp án đã chọn sai ở bước hiện tại
  const [showStmt, setShowStmt] = useState(true); // đề bài ghim phía trên, luôn mở lúc vào; học sinh tự thu gọn khi cần thêm chỗ
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
    // Kiểu trắc nghiệm: đáp án bước 1 đã có trong trang, xáo ngẫu nhiên ngay ở máy học sinh (mỗi lần mở một thứ tự); phản hồi của server không đè lại thứ tự này.
    const mine = p.options && [...p.options].sort(() => Math.random() - 0.5);
    setProb(p); setBusy(!p.greeting); setErr(""); setSmode(null); setAsking(false); setWrong(0); setTried([]); setProg(p.mode !== "chat" ? { done: 0, total: p.total, next: 1, goal: p.goal, options: mine } : null);
    if (p.greeting) setMsgs([{ role: "bot", text: p.greeting }]); // hiện lời chào ngay; server tạo phiên song song, có sid thì mở ô nhập
    const { ok, data } = await post<R>("/api/chat", { action: "start", slug, problemCode: p.id, studentCode: who?.code, studentName: who?.name });
    if (my !== tok.current) return;
    setBusy(false);
    if (!ok) { setErr(data.error ?? "Có lỗi."); started.current = false; setMsgs([]); if (problems.length > 1) setProb(null); return; } // lỗi: bỏ lời chào đã hiện, nhiều đề thì về danh sách (lỗi hiện ở đó)
    setSid(data.sessionId);
    setSmode(data.mode ?? null);
    const theirs = data.progress?.options; // khác tập đáp án (đề vừa được sửa) hoặc khác kiểu thì dùng của server
    const same = mine && theirs && mine.length === theirs.length && mine.every((o) => theirs.includes(o));
    setProg(data.progress ? { ...data.progress, ...(same && { options: mine }) } : null);
    if (!p.greeting || (data.mode && data.mode !== p.mode)) setMsgs([{ role: "bot", text: data.reply ?? "" }]); // lời chào dự đoán sai kiểu: thay bằng lời chào của server
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
    setWho(null); setProb(null); setSid(undefined); setMsgs([]); setDone(false); setRated(false); setSure(false); setErr(""); setSmode(null); setProg(null); setAsking(false); setWrong(0); setTried([]);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !sid || busy) return;
    setText(""); setErr(""); setBusy(true);
    setMsgs((m) => [...m, { role: "student", text: t }]);
    const ask = asking;
    const { ok, data } = await post<R>("/api/chat", { action: "message", slug, sessionId: sid, text: t, ...(ask && { ask: true }) });
    setBusy(false);
    if (!ok) { setMsgs((m) => m.slice(0, -1)); setText(t); return setErr(data.error ?? "Có lỗi. Bạn thử gửi lại nhé."); } // trả tin về ô nhập để không mất
    setMsgs((m) => [...m, { role: "bot", text: data.reply ?? "" }]);
    if (ask) setAsking(false);
    else if (data.progress) setWrong(data.progress.done > (prog?.done ?? 0) ? 0 : (w) => w + 1);
    if (data.progress) setProg(data.progress);
    if (data.done) setDone(true);
  }

  // Kiểu trắc nghiệm: gửi đáp án đã chọn, server chấm. Sai thì đáp án đó bị loại khỏi danh sách; đúng hoặc qua bước thì làm mới.
  async function pick(choice: string) {
    if (!sid || busy) return;
    setErr(""); setBusy(true);
    setMsgs((m) => [...m, { role: "student", text: choice }]);
    const { ok, data } = await post<R>("/api/chat", { action: "pick", slug, sessionId: sid, choice });
    setBusy(false);
    if (!ok) { setMsgs((m) => m.slice(0, -1)); return setErr(data.error ?? "Có lỗi. Bạn thử lại nhé."); }
    setMsgs((m) => [...m, { role: "bot", text: data.reply ?? "" }]);
    setTried(data.ok === false && data.progress?.next === prog?.next ? (t) => [...t, choice] : []);
    if (data.progress) setProg(data.progress);
    if (data.done) setDone(true);
  }

  // Nút Gợi ý (kiểu từng bước, trắc nghiệm): gợi ý có sẵn của đề, không gọi AI.
  async function hint() {
    if (!sid || busy) return;
    setErr(""); setBusy(true);
    const { ok, data } = await post<R>("/api/chat", { action: "hint", slug, sessionId: sid });
    setBusy(false);
    if (!ok) return setErr(data.error ?? "Có lỗi. Bạn thử lại nhé.");
    setMsgs((m) => [...m, { role: "bot", text: data.reply ?? "" }]);
    if (data.progress) setProg(data.progress);
    if (data.done) setDone(true); // hết gợi ý mà kẹt đủ lượt: server hiện lời giải bước cuối và kết thúc bài
  }

  // Quay lại danh sách đề. Phiên đang làm dở để nguyên ("Bỏ dở"), giống khi học sinh đóng tab.
  function back() {
    tok.current++;
    setProb(null); setSid(undefined); setMsgs([]); setDone(false); setRated(false); setSure(false); setText(""); setErr(""); setBusy(false); setShowStmt(true); setSmode(null); setProg(null); setAsking(false); setWrong(0); setTried([]);
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

  const Input = INPUTS[smode ?? prob.mode];
  return (
    <div className="h-screen-d mx-auto flex max-w-2xl flex-col overflow-hidden text-sm">
      <header className="shrink-0 border-b border-border bg-surface px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-3 sm:mb-2">
          <Brand size="sm" />
          <p className="truncate text-sm text-text-muted" title={label}>{label}</p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="truncate text-sm font-semibold sm:text-lg">{prob.title}</h1>
          {problems.length > 1 && <Button variant="ghost" type="button" onClick={back} className="-mr-3 shrink-0 text-sm">← Danh sách</Button>}
        </div>
      </header>

      {prob.statement && (
        <section aria-label="Đề bài" className="shrink-0 border-b border-border border-l-4 border-l-primary bg-primary-soft px-4 py-1">
          <div className="flex h-7 items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">Đề bài</h2>
            <button type="button" onClick={() => setShowStmt(!showStmt)} aria-expanded={showStmt} className="-mr-2 h-7 rounded-sm px-2 text-xs font-medium text-primary hover:bg-surface">{showStmt ? "Thu gọn" : "Xem đề"}</button>
          </div>
          {showStmt && <div className="max-h-[28dvh] overflow-y-auto leading-tight [&_.katex]:text-[1.05em] [&_.katex-display]:my-0.5 [&_.py-1]:py-0"><MathText text={prob.statement.replace(/\n{2,}/g, "\n").trim()} /></div>}
        </section>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3" role="log" aria-live="polite">
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

      <footer className="max-h-[55dvh] shrink-0 overflow-y-auto border-t border-border bg-surface px-4 pt-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        {err && <div className="mb-2"><Alert tone="danger">{err}{sid ? ` (Mã phiên: ${shortId(sid)})` : ""}</Alert></div>}
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
          <Input text={text} setText={setText} busy={busy} ready={!!sid} onSend={send} onFinish={finishNow} onHint={hint} onPick={pick} tried={tried} canFinish={msgs.length >= 3} progress={prog} asking={asking} setAsking={setAsking} stuck={wrong >= 2} box={box} />
        )}
        {sid && <p className="mt-2 hidden text-xs sm:block text-text-muted">Mã phiên: <span className="tnum font-mono">{shortId(sid)}</span></p>}
      </footer>
    </div>
  );
}
