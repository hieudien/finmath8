"use client";
import { useEffect, useRef, useState } from "react";
import Brand from "@/components/Brand";
import { Alert, Button, Field, post } from "@/components/ui";
import { MathText } from "@/components/MathText";
import { StepInput } from "@/components/ChatInputs";
import { shortId } from "@/lib/sid";

type P = { id: string; title: string; statement: string; greeting: string; total: number; goal: string; example: string };
type M = { role: "student" | "bot"; text: string };
type Prog = { done: number; total: number; next?: number; goal?: string; example?: string };
type Resume = { sessionId: string; progress: Prog; lastAt: string };
type R = { sessionId?: string; msgs?: M[]; resume?: Resume; reply?: string; step?: number; done?: boolean; progress?: Prog; misrouted?: boolean };

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!(m >= 0)) return "";
  return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`;
}

export default function Chat({ slug, label, problems }: { slug: string; label: string; problems: P[] }) {
  const [prob, setProb] = useState<P | null>(null);
  const [sid, setSid] = useState<string>();
  const [msgs, setMsgs] = useState<M[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [text, setText] = useState("");
  const [prog, setProg] = useState<Prog | null>(null);
  const [askOpen, setAskOpen] = useState(false); // khay "Hỏi bài" (ô gõ riêng, tách khỏi ô nộp bước)
  const [askText, setAskText] = useState("");
  const [wrong, setWrong] = useState(0); // số lần nộp liên tiếp chưa qua bước, từ 2 thì nhắc bấm Gợi ý
  const [showStmt, setShowStmt] = useState(false); // mobile: đề thu gọn 1 dòng, bấm mở bottom sheet; desktop: đề luôn hiện đủ ở cột trái
  const [who, setWho] = useState<{ name: string; cls: string } | null>(null); // thông tin học sinh, chỉ giữ trong trang này; vào lại link hoặc tải lại là nhập lại
  const [pending, setPending] = useState<(Resume & { p: P }) | null>(null); // bài làm dở đang chờ học sinh chọn làm tiếp hay làm lại
  const [fClass, setFClass] = useState("");
  const [fName, setFName] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);
  const tok = useRef(0); // mỗi lần mở bài/quay lại tăng 1: phản hồi của lần cũ đến muộn thì bỏ

  const [kbVv, setKb] = useState(false); // visualViewport co lại (Android)
  const lastH = useRef(0);
  const [focus, setFocus] = useState(false); // iOS Safari không co visualViewport đáng tin: ô nhập đang focus trên mobile thì coi như bàn phím mở
  const kb = kbVv || focus;

  useEffect(() => {
    const on = () => setTimeout(() => setFocus(window.innerWidth < 640 && !!box.current && document.activeElement === box.current), 0);
    document.addEventListener("focusin", on); document.addEventListener("focusout", on);
    return () => { document.removeEventListener("focusin", on); document.removeEventListener("focusout", on); };
  }, []);

  // Bàn phím ảo không làm dvh co lại: đo visualViewport, khung chat khớp phần nhìn thấy để đề, bước và ô nhập không bị che.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !who) return; // form nhập tên: không khóa cuộn trang
    const root = document.documentElement;
    const upd = () => {
      // iOS "Xong" đóng bàn phím nhưng ô nhập vẫn giữ focus: vùng nhìn thấy to ra thì bỏ focus để thoát chế độ gọn
      if (vv.height > lastH.current + 80 && document.activeElement === box.current) { box.current?.blur(); setFocus(false); }
      lastH.current = vv.height;
      root.style.setProperty("--vvh", `${vv.height}px`);
      root.style.setProperty("--vvt", `${vv.offsetTop}px`); // iOS: vùng nhìn thấy có thể lệch xuống so với trang
      setKb(window.innerWidth < 640 && vv.height < window.innerHeight * 0.75);
    };
    document.body.style.overflow = "hidden"; // iOS tự cuộn trang khi focus; khung chat là fixed và bám theo vùng nhìn thấy, trang không cần cuộn
    upd();
    vv.addEventListener("resize", upd); vv.addEventListener("scroll", upd);
    return () => { vv.removeEventListener("resize", upd); vv.removeEventListener("scroll", upd); root.style.removeProperty("--vvh"); root.style.removeProperty("--vvt"); document.body.style.overflow = ""; };
  }, [who]);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  // Mở đề: nếu học sinh (cùng tên + lớp) đã làm dở đề này thì hỏi làm tiếp hay làm lại; kiểm tra lỗi thì cứ mở bài mới.
  async function start(p: P) {
    const my = ++tok.current;
    setProb(p); setMsgs([]); setErr(""); setBusy(true); setPending(null); // chưa có sid: hiện khung "Đang mở bài"
    const c = await post<R>("/api/chat", { action: "resume_check", slug, problemCode: p.id, studentName: who?.name, studentClass: who?.cls });
    if (my !== tok.current) return;
    if (c.ok && c.data.resume) { setBusy(false); setPending({ p, ...c.data.resume }); return; }
    begin(p, my);
  }

  async function resume() {
    if (!pending) return;
    const my = ++tok.current, { p, sessionId } = pending;
    setBusy(true);
    const { ok, data } = await post<R>("/api/chat", { action: "resume", slug, sessionId, studentName: who?.name, studentClass: who?.cls });
    if (my !== tok.current) return;
    if (!ok || !data.sessionId) { setBusy(false); setErr(data.error ?? "Không mở lại được bài dở. Bạn thử lại hoặc chọn làm lại mới."); return; }
    setPending(null); setBusy(false); setErr(""); setWrong(0); setDone(false); setAskOpen(false); setAskText("");
    setMsgs(data.msgs ?? []); setSid(data.sessionId); setProg(data.progress ?? { done: 0, total: p.total });
  }

  async function restart() {
    if (!pending) return;
    const my = ++tok.current, { p, sessionId } = pending;
    setPending(null); setBusy(true);
    await post("/api/chat", { action: "abandon", slug, sessionId, studentName: who?.name, studentClass: who?.cls }); // lỗi cũng bỏ qua: vẫn mở bài mới
    if (my !== tok.current) return;
    begin(p, my);
  }

  async function begin(p: P, my: number) {
    setProb(p); setBusy(false); setErr(""); setAskOpen(false); setAskText(""); setWrong(0); setProg({ done: 0, total: p.total, next: 1, goal: p.goal, example: p.example });
    setMsgs([{ role: "bot", text: p.greeting }]); // hiện lời chào ngay; server tạo phiên song song, có sid thì mở ô nhập
    const { ok, data } = await post<R>("/api/chat", { action: "start", slug, problemCode: p.id, studentName: who?.name, studentClass: who?.cls });
    if (my !== tok.current) return;
    setBusy(false);
    if (!ok) { setErr(data.error ?? "Có lỗi."); started.current = false; setMsgs([]); if (problems.length > 1) setProb(null); return; } // lỗi: bỏ lời chào đã hiện, nhiều đề thì về danh sách (lỗi hiện ở đó)
    setSid(data.sessionId);
    if (data.progress) setProg(data.progress);
  }

  useEffect(() => {
    if (who && problems.length === 1 && !started.current) { started.current = true; start(problems[0]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);

  function saveWho(e: React.FormEvent) {
    e.preventDefault();
    const cls = fClass.trim().replace(/\s+/g, "").toUpperCase(), name = fName.trim().replace(/\s+/g, " ");
    if (name.length < 2) return setErr("Bạn nhập họ và tên nhé.");
    if (!cls || cls.length > 10) return setErr("Bạn nhập lớp nhé (tối đa 10 ký tự).");
    setErr("");
    setWho({ name, cls });
  }

  function changeWho() {
    started.current = false; tok.current++; setPending(null);
    setWho(null); setProb(null); setSid(undefined); setMsgs([]); setDone(false); setErr(""); setProg(null); setAskOpen(false); setAskText(""); setWrong(0);
  }

  // Nộp bước giải (ô chính) hoặc gửi câu hỏi (khay Hỏi bài): hai ô gõ riêng, cùng đường gửi.
  async function submit(raw: string, ask: boolean) {
    const t = raw.trim();
    if (!t || !sid || busy) return;
    (ask ? setAskText : setText)(""); setErr(""); setBusy(true);
    setMsgs((m) => [...m, { role: "student", text: ask ? `❓ ${t}` : t }]);
    const { ok, data } = await post<R>("/api/chat", { action: "message", slug, sessionId: sid, text: t, ...(ask && { ask: true }) });
    setBusy(false);
    if (!ok) { setMsgs((m) => m.slice(0, -1)); (ask ? setAskText : setText)(t); return setErr(data.error ?? "Có lỗi. Bạn thử gửi lại nhé."); } // trả tin về ô nhập để không mất
    setMsgs((m) => [...m, { role: "bot", text: data.reply ?? "" }]);
    if (ask) { setAskOpen(false); if (data.misrouted) setText(t); } // gửi nhầm bước vào khay hỏi: chuyển nguyên văn sang ô Nộp bước, bấm Nộp bước là xong
    else if (data.progress) setWrong(data.progress.done > (prog?.done ?? 0) ? 0 : (w) => w + 1);
    if (data.progress) setProg(data.progress);
    if (data.done) setDone(true);
  }
  const send = (e: React.FormEvent) => { e.preventDefault(); return submit(text, false); };
  const sendAsk = (e: React.FormEvent) => { e.preventDefault(); return submit(askText, true); };

  // Nút Gợi ý: gợi ý có sẵn của đề, không gọi AI.
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
    tok.current++; setPending(null);
    setProb(null); setSid(undefined); setMsgs([]); setDone(false); setText(""); setErr(""); setBusy(false); setShowStmt(false); setProg(null); setAskOpen(false); setAskText(""); setWrong(0);
  }

  if (!who) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col gap-4 px-4 py-8">
        <Brand tagline />
        <h1>{label}</h1>
        <p className="text-text-muted">Nhập họ tên và lớp để bắt đầu. Giáo viên sẽ xem kết quả để biết bạn cần hỗ trợ phần nào.</p>
        <form onSubmit={saveWho} className="flex flex-col gap-3">
          <Field label="Họ và tên" value={fName} onChange={(e) => setFName(e.target.value)} maxLength={60} autoComplete="off" required />
          <Field label="Lớp" value={fClass} onChange={(e) => setFClass(e.target.value)} maxLength={10} autoComplete="off" required />
          {err && <Alert tone="danger">{err}</Alert>}
          <Button type="submit" disabled={!fClass.trim() || !fName.trim()}>Tiếp tục</Button>
        </form>
      </main>
    );
  }

  if (!prob && problems.length === 1) return err ? <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col gap-4 px-4 py-8"><Brand tagline /><Alert tone="danger">{err}</Alert><Button variant="secondary" type="button" onClick={changeWho}>Đổi thông tin</Button></main> : null;
  if (!prob) {
    return (
      <main className="h-screen-d mx-auto flex max-w-md flex-col gap-4 overflow-hidden px-4 py-8">
        <Brand tagline />
        <h1>{label}</h1>
        <p className="text-text-muted">Xin chào <b>{who.name}</b> (lớp {who.cls}). Chọn một bài để bắt đầu. Chatbot sẽ gợi ý từng bước, bạn hãy tự suy nghĩ trước khi xin gợi ý.</p>
        <Button variant="ghost" type="button" onClick={changeWho} className="-ml-3 self-start text-sm">Đổi thông tin</Button>
        {err && <Alert tone="danger">{err}</Alert>}
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
          {problems.map((p, i) => (
            <li key={p.id}>
              <button onClick={() => start(p)} className="min-h-11 w-full rounded-sm border border-border-strong bg-surface px-4 py-3 text-left hover:bg-primary-soft">
                <span className="font-medium"><span className="tnum mr-2 text-text-muted">{i + 1}.</span>{p.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <>
    {pending && (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
        <div role="dialog" aria-modal="true" aria-label="Bài làm dở" className="flex w-full max-w-sm flex-col gap-3 rounded-lg bg-surface p-5 shadow-lg">
          <h2 className="text-base font-semibold">Em đang làm dở bài này</h2>
          <p className="text-text-muted">Em đã làm {pending.progress.done}/{pending.progress.total} bước{ago(pending.lastAt) ? ` (${ago(pending.lastAt)})` : ""}. Em muốn làm tiếp hay làm lại từ đầu?</p>
          {err && <Alert tone="danger">{err}</Alert>}
          <Button type="button" onClick={resume} disabled={busy}>Làm tiếp</Button>
          <Button type="button" variant="secondary" onClick={restart} disabled={busy}>Làm lại mới</Button>
          {problems.length > 1 && <Button type="button" variant="ghost" onClick={back} disabled={busy}>← Danh sách bài</Button>}
        </div>
      </div>
    )}
    <div style={{ transform: "translateY(var(--vvt, 0px))" }} className="h-screen-d fixed inset-x-0 top-0 mx-auto flex max-w-2xl flex-col overflow-hidden bg-bg text-sm lg:max-w-6xl">
      <header className={`shrink-0 border-b border-border bg-surface px-4 py-0.5 sm:py-3 ${kb ? "hidden" : ""}`}>
        <div className="mb-2 hidden items-center justify-between gap-3 sm:flex">
          <Brand size="sm" />
          <p className="truncate text-sm text-text-muted" title={label}>{label}{sid && <span className="tnum ml-2 font-mono text-xs">#{shortId(sid)}</span>}</p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="truncate text-xs font-semibold sm:text-lg">MathStep AI</h1>
          {problems.length > 1 && <Button variant="ghost" type="button" onClick={back} className="-mr-3 shrink-0 text-xs max-sm:min-h-8! sm:text-sm">← Danh sách bài</Button>}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {prob.statement && (
        <section aria-label="Đề bài" className="shrink-0 border-b border-border border-l-4 border-l-primary bg-primary-soft px-4 py-1 lg:w-2/5 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-4 lg:text-base">
          <div className="flex h-7 items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">Đề bài</h2>
            <button type="button" onClick={() => setShowStmt(true)} className="-mr-2 h-7 rounded-sm px-2 text-xs font-medium text-primary hover:bg-surface lg:hidden">Xem đủ</button>
          </div>
          <div style={kb ? { maxHeight: "calc(var(--vvh) * 0.22)" } : undefined} className={`${kb ? "" : "max-h-[5.5rem]"} overflow-y-auto overscroll-contain leading-tight lg:max-h-none lg:overflow-visible lg:leading-normal [&_.katex]:text-[1.05em] [&_.katex-display]:my-0.5 [&_.py-1]:py-0`}><MathText text={prob.statement.replace(/\n{2,}/g, "\n").trim()} /></div>
        </section>
      )}
      {showStmt && prob.statement && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/40 lg:hidden" onClick={() => setShowStmt(false)}>
          <div role="dialog" aria-label="Đề bài" style={{ maxHeight: "calc(var(--vvh, 100dvh) * 0.75)" }} className="overflow-y-auto rounded-t-xl bg-surface px-4 pb-6 pt-3 text-base" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">Đề bài</h2>
              <Button variant="ghost" type="button" onClick={() => setShowStmt(false)} className="-mr-3 text-sm">Đóng</Button>
            </div>
            <MathText text={prob.statement.replace(/\n{2,}/g, "\n").trim()} />
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
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

      <footer className={`shrink-0 overflow-y-auto border-border bg-surface px-4 pt-2 border-t ${kb ? "" : "max-h-[35dvh] sm:max-h-[45dvh]"}`} style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}>
        {err && <div className="mb-2"><Alert tone="danger">{err}{sid ? ` (Mã phiên: ${shortId(sid)})` : ""}</Alert></div>}
        {done ? (
          <div className="flex flex-col gap-3">
            <Alert tone="success">Em đã hoàn thành bài. Cảm ơn em.</Alert>
          </div>
        ) : (
          <StepInput text={text} setText={setText} busy={busy} ready={!!sid} onSend={send} onHint={hint} progress={prog} askOpen={askOpen} setAskOpen={setAskOpen} askText={askText} setAskText={setAskText} onAsk={sendAsk} stuck={wrong >= 2} box={box} compact={kb} />
        )}
      </footer>
      </div>
      </div>
    </div>
    </>
  );
}
