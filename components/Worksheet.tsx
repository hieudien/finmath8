"use client";
import { useEffect, useRef, useState } from "react";
import Brand from "@/components/Brand";
import { Alert, Badge, Button, Field, post } from "@/components/ui";
import { MathText } from "@/components/MathText";
import FormulaButton from "@/components/FormulaButton";
import type { WsProblem, WsStep } from "@/lib/worksheet/view";

// Chế độ "làm theo bước rồi nộp cả bài" (luồng riêng, gọi /api/worksheet). Mobile-first: một cột, ô nhập chữ 16px, thanh nộp bài dính đáy.
type Res = { step: number; ok: boolean; note: string; unjudged?: boolean };
type Style = "steps" | "whole"; // kiểu nhập: mỗi bước một ô, hoặc cả bài một ô (học sinh chọn, khóa sau lần nộp đầu)
type Resume = { sessionId: string; done: number; filled: number; total: number; lastAt: string; style?: Style }; // done: bước đã đúng; filled: bước đã điền nháp nhưng chưa nộp (kiểu cả bài: 1 nếu đã viết)
type Saved = { locked: number[]; revealed: number[]; answers: string[]; results: Res[]; style?: Style; whole?: string };
type Submit = { attempt: number; results: Res[]; locked: number[]; done: boolean; own?: number; total?: number };
type Draft = { step: number; state: "saving" | "saved" | "error" }; // trạng thái lưu nháp của ô vừa rời
type AskState = { open: boolean; text: string; reply: string; q: string }; // q: câu hỏi vừa gửi, hiện lại phía trên câu trả lời

const ANSWER_MAX = 500;
const WHOLE_MAX = 3000;
const ASK_MAX = 200;
const HINTS = 3;
const GUIDE = ["Đọc kỹ đề bài.", "Mở từng bước để xem hướng dẫn. Chưa rõ thì mở thêm gợi ý ở bên trong.", "Giải từng bước ra giấy nháp.", "Chép kết quả từng bước vào đúng ô của bước đó.", "Điền đủ các bước rồi mới bấm Nộp bài."];
const GUIDE_WHOLE = ["Đọc kỹ đề bài.", "Mở từng bước để xem hướng dẫn. Chưa rõ thì mở thêm gợi ý ở bên trong.", "Giải cả bài ra giấy nháp.", "Chép lời giải cả bài vào ô bên dưới, mỗi ý một dòng, nên viết theo thứ tự các bước.", "Viết xong rồi bấm Nộp bài."];

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!(m >= 0)) return "";
  return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`;
}

export default function Worksheet({ slug, label, problems }: { slug: string; label: string; problems: WsProblem[] }) {
  const [who, setWho] = useState<{ name: string; cls: string } | null>(null);
  const [fName, setFName] = useState("");
  const [fClass, setFClass] = useState("");
  const [prob, setProb] = useState<WsProblem | null>(null);
  const [sid, setSid] = useState<string>();
  const [answers, setAnswers] = useState<string[]>([]);
  const [style, setStyle] = useState<Style>("steps");
  const [whole, setWhole] = useState("");
  const wholeBox = useRef<HTMLTextAreaElement>(null);
  const [locked, setLocked] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [results, setResults] = useState<Record<number, Res>>({});
  const [hints, setHints] = useState<Record<string, string>>({}); // "bước:mức" -> nội dung đã tải
  const [hintOpen, setHintOpen] = useState<Record<string, boolean>>({});
  const [reveals, setReveals] = useState<Record<string, string>>({}); // bước -> lời giải đã xem
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [asks, setAsks] = useState<Record<number, AskState>>({});
  const [showStmt, setShowStmt] = useState(false); // mobile: bảng trượt xem đủ đề bài
  const [showHints, setShowHints] = useState(false); // mobile: flyout hướng dẫn và gợi ý các bước
  const [wide, setWide] = useState(false); // màn to (>= lg): hướng dẫn nằm cột trái; còn lại nằm trong flyout. Chỉ render một nơi để id không trùng.
  const [confirm, setConfirm] = useState<number | null>(null);
  const [busy, setBusy] = useState(""); // khóa thao tác đang chạy: "start", "submit", "hint:2:1", "reveal:2", "ask:2"
  const [err, setErr] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState<{ own: number; total: number } | null>(null);
  const [pending, setPending] = useState<(Resume & { p: WsProblem }) | null>(null);
  const [typing, setTyping] = useState(false); // đang gõ trên điện thoại: ẩn thanh nộp bài để bàn phím không chiếm thêm chỗ
  const tok = useRef(0);
  const started = useRef(false);
  const top = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  // Bản nháp lưu trên server khi rời ô nhập (không dùng localStorage): làm tiếp được từ thiết bị khác. Ref để lần lưu luôn thấy đáp án mới nhất.
  const live = useRef({ sid: undefined as string | undefined, answers: [] as string[], style: "steps" as Style, whole: "", done: false });
  const inflight = useRef<Promise<unknown>>(Promise.resolve()); // lần lưu nháp đang chạy: nộp bài chờ nó xong để nháp không ghi đè sau lần nộp
  const saved = useRef(""); // bản nháp đã lưu gần nhất (JSON), giống thì không gọi lại
  const serverBlank = useRef(true); // nháp trên server đang trống (hoặc chưa có): rời ô khi vẫn chưa nhập gì thì không lưu
  live.current = { sid, answers, style, whole, done: !!done };
  // Ảnh chụp để so "đã lưu chưa": kiểu từng bước giữ nguyên dạng cũ (mảng đáp án), kiểu cả bài là văn bản một ô.
  const blankOf = (l: typeof live.current) => (l.style === "whole" ? !l.whole.trim() : l.answers.every((a) => !a.trim())); // chưa nhập gì
  const snapOf = (l: typeof live.current) => JSON.stringify(l.style === "whole" ? { whole: l.whole } : l.answers);
  const payloadOf = (l: typeof live.current) => ({ style: l.style, answers: l.style === "whole" ? [] : l.answers, whole: l.style === "whole" ? l.whole : "" });

  useEffect(() => {
    const on = () => setTimeout(() => { const a = document.activeElement; setTyping(window.innerWidth < 640 && (a instanceof HTMLTextAreaElement || a instanceof HTMLInputElement)); }, 0);
    document.addEventListener("focusin", on); document.addEventListener("focusout", on);
    return () => { document.removeEventListener("focusin", on); document.removeEventListener("focusout", on); };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (!showHints && !showStmt) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setShowHints(false); setShowStmt(false); } };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [showHints, showStmt]);

  async function saveDraft(step: number) {
    const l = live.current;
    if (!l.sid || l.done || !l.answers.length || snapOf(l) === saved.current || (blankOf(l) && serverBlank.current)) return;
    const snap = snapOf(l);
    setDraft({ step, state: "saving" });
    const req = post("/api/worksheet", { action: "draft", slug, sessionId: l.sid, ...payloadOf(l) }, 15_000);
    inflight.current = req.catch(() => null);
    const r = await req;
    if (r.ok) { saved.current = snap; serverBlank.current = blankOf(l); }
    setDraft({ step, state: r.ok ? "saved" : "error" });
  }

  // Đóng tab, tải lại hoặc chuyển ứng dụng: gửi nốt bản nháp chưa lưu (sendBeacon vẫn chạy khi trang đang đóng).
  useEffect(() => {
    const flush = () => {
      const l = live.current;
      if (!l.sid || l.done || !l.answers.length || snapOf(l) === saved.current || (blankOf(l) && serverBlank.current)) return;
      try { if (navigator.sendBeacon("/api/worksheet", new Blob([JSON.stringify({ action: "draft", slug, sessionId: l.sid, ...payloadOf(l) })], { type: "application/json" }))) { saved.current = snapOf(l); serverBlank.current = blankOf(l); } } catch { /* bỏ qua */ }
    };
    const vis = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush); document.addEventListener("visibilitychange", vis);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", vis); };
  }, [slug]);

  function reset() {
    setSid(undefined); setStyle("steps"); setWhole(""); setLocked([]); setRevealed([]); setResults({}); setHints({}); setHintOpen({}); setReveals({}); setOpen({}); setAsks({}); setConfirm(null);
    setErr(""); setAttempt(0); setDone(null); setDraft(null); saved.current = ""; serverBlank.current = true;
  }

  // Mở đề: học sinh (cùng tên + lớp) đã làm dở đề này thì hỏi làm tiếp hay làm lại.
  async function pickProblem(p: WsProblem) {
    const my = ++tok.current;
    reset(); setProb(p); setAnswers(p.steps.map(() => "")); setOpen({ 0: true }); setBusy("start");
    const c = await post<{ resume?: Resume }>("/api/worksheet", { action: "resume_check", slug, problemCode: p.id, studentName: who?.name, studentClass: who?.cls });
    if (my !== tok.current) return;
    if (c.ok && c.data.resume) { setBusy(""); setPending({ p, ...c.data.resume }); return; }
    begin(p, my);
  }

  async function begin(p: WsProblem, my: number) {
    setBusy("start");
    const { ok, data } = await post<{ sessionId?: string }>("/api/worksheet", { action: "start", slug, problemCode: p.id, studentName: who?.name, studentClass: who?.cls });
    if (my !== tok.current) return;
    setBusy("");
    if (!ok || !data.sessionId) { setErr(data.error ?? "Có lỗi."); started.current = false; if (problems.length > 1) setProb(null); return; }
    saved.current = JSON.stringify(p.steps.map(() => "")); serverBlank.current = true;
    setSid(data.sessionId);
  }

  async function resume() {
    if (!pending) return;
    const my = ++tok.current, { p, sessionId } = pending;
    setBusy("start");
    const { ok, data } = await post<Saved & { sessionId?: string }>("/api/worksheet", { action: "resume", slug, sessionId, studentName: who?.name, studentClass: who?.cls });
    if (my !== tok.current) return;
    setBusy("");
    if (!ok || !data.sessionId) { setErr(data.error ?? "Không mở lại được bài dở. Bạn thử lại hoặc chọn làm lại mới."); return; }
    setPending(null); setErr("");
    const ans = p.steps.map((_, i) => data.answers[i] ?? ""); // server đã gộp: bước đã khóa là đáp án đã nộp, bước còn lại là bản nháp mới nhất
    const st: Style = data.style === "whole" ? "whole" : "steps";
    setStyle(st); setWhole(data.whole ?? "");
    setAnswers(ans); saved.current = st === "whole" ? JSON.stringify({ whole: data.whole ?? "" }) : JSON.stringify(ans);
    serverBlank.current = st === "whole" ? !(data.whole ?? "").trim() : ans.every((a) => !a.trim());
    setHints({}); setReveals({}); // gợi ý và lời giải không lưu ở trình duyệt: học sinh bấm xem lại khi cần (xem lại không ghi nhận thêm)
    setLocked(data.locked); setRevealed(data.revealed);
    setResults(Object.fromEntries(data.results.filter((r) => !r.ok).map((r) => [r.step, r])));
    setOpen({}); // nhận xét bước sai hiện sẵn dưới tiêu đề bước, không cần mở
    setSid(data.sessionId);
  }

  async function restart() {
    if (!pending) return;
    const my = ++tok.current, { p, sessionId } = pending;
    setPending(null); setBusy("start");
    await post("/api/worksheet", { action: "abandon", slug, sessionId, studentName: who?.name, studentClass: who?.cls });
    if (my !== tok.current) return;
    setAnswers(p.steps.map(() => ""));
    begin(p, my);
  }

  useEffect(() => {
    if (who && problems.length === 1 && !started.current) { started.current = true; pickProblem(problems[0]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who]);

  function saveWho(e: React.FormEvent) {
    e.preventDefault();
    const cls = fClass.trim().replace(/\s+/g, "").toUpperCase(), name = fName.trim().replace(/\s+/g, " ");
    if (name.length < 2) return setErr("Bạn nhập họ và tên nhé.");
    if (!cls || cls.length > 10) return setErr("Bạn nhập lớp nhé (tối đa 10 ký tự).");
    setErr(""); setWho({ name, cls });
  }

  function leave() { void saveDraft(-1); tok.current++; started.current = false; setPending(null); setProb(null); reset(); setBusy(""); }
  function changeWho() { leave(); setWho(null); }

  async function hint(i: number, lvl: number) {
    const k = `${i}:${lvl}`;
    if (hints[k]) return setHintOpen((o) => ({ ...o, [k]: !o[k] })); // đã tải: chỉ đóng/mở, không ghi nhận lại
    if (!sid || busy) return;
    setBusy(`hint:${k}`); setErr("");
    const { ok, data } = await post<{ text?: string }>("/api/worksheet", { action: "hint", slug, sessionId: sid, step: i, level: lvl });
    setBusy("");
    if (!ok || !data.text) return setErr(data.error ?? "Có lỗi. Bạn thử lại nhé.");
    setHints((h) => ({ ...h, [k]: data.text! })); setHintOpen((o) => ({ ...o, [k]: true }));
  }

  async function reveal(i: number) {
    if (!sid || busy) return;
    setBusy(`reveal:${i}`); setErr("");
    const { ok, data } = await post<{ text?: string }>("/api/worksheet", { action: "reveal", slug, sessionId: sid, step: i });
    setBusy(""); setConfirm(null);
    if (!ok || !data.text) return setErr(data.error ?? "Có lỗi. Bạn thử lại nhé.");
    setReveals((r) => ({ ...r, [i]: data.text! })); setRevealed((r) => (r.includes(i) ? r : [...r, i]));
  }

  async function ask(i: number) {
    const a = asks[i];
    if (!sid || busy || !a?.text.trim()) return;
    setBusy(`ask:${i}`); setErr("");
    const { ok, data } = await post<{ reply?: string }>("/api/worksheet", { action: "ask", slug, sessionId: sid, step: i, text: a.text.trim() });
    setBusy("");
    if (!ok || !data.reply) return setErr(data.error ?? "Có lỗi. Bạn thử lại nhé.");
    setAsks((m) => ({ ...m, [i]: { open: true, text: "", reply: data.reply!, q: a.text.trim() } }));
    window.setTimeout(() => document.getElementById(`reply-${i}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60); // câu trả lời nằm dưới khay hỏi: cuộn tới cho khỏi bỏ sót
  }

  // Đóng gợi ý, hộp xác nhận xem đáp án và khay hỏi (nội dung gợi ý đã tải vẫn giữ nên mở lại không ghi nhận thêm).
  function collapseExtras() {
    setHintOpen({}); setConfirm(null);
    setAsks((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, open: false }])));
  }
  const scrollTo = (id: string, block: ScrollLogicalPosition) => window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block }), 60);
  // Chỉ một bước hướng dẫn mở cùng lúc: mở bước mới thì đóng bước cũ và mọi gợi ý, khay hỏi.
  function toggleStep(i: number) {
    if (open[i]) return setOpen({});
    collapseExtras(); setOpen({ [i]: true }); scrollTo(`guide-${i}`, "nearest");
  }
  // Chọn hướng dẫn của bước i (không cuộn): dùng khi bấm vào ô trả lời.
  function selectStep(i: number) {
    if (open[i]) return;
    collapseExtras(); setOpen({ [i]: true });
  }
  // Bấm "💡 Gợi ý" ở thẻ trả lời: màn to cuộn cột trái tới bước đó; điện thoại mở flyout.
  function showGuide(i: number) {
    if (!open[i]) { collapseExtras(); setOpen({ [i]: true }); }
    if (!wide) setShowHints(true);
    scrollTo(`guide-${i}`, "nearest");
  }
  // Từ bảng "cần sửa": cuộn tới ô trả lời của bước và chọn hướng dẫn bước đó.
  function goStep(i: number) { selectStep(i); scrollTo(`step-${i}`, "start"); }

  const isWhole = style === "whole";
  const submitted = attempt > 0 || locked.length > 0 || Object.keys(results).length > 0; // đã nộp ít nhất một lần: khóa kiểu nhập
  const need = isWhole ? [] : (prob?.steps ?? []).map((_, i) => i).filter((i) => !locked.includes(i) && !answers[i]?.trim());
  const ready = !!sid && !done && (isWhole ? !!whole.trim() : need.length === 0);

  // Đổi kiểu nhập (chỉ trước lần nộp đầu). Từng bước sang cả bài: nếu ô cả bài còn trống thì ghép các ô đã điền ("Bước k: ..."). Nội dung kiểu kia vẫn giữ nên đổi lại không mất.
  function pickStyle(next: Style) {
    if (next === style || submitted || busy || done) return;
    if (next === "whole" && !whole.trim()) setWhole(answers.map((a, i) => (a.trim() ? `Bước ${i + 1}: ${a.trim()}` : "")).filter(Boolean).join("\n"));
    setStyle(next);
  }

  async function submit() {
    if (!sid || busy || !prob || !ready) return;
    setBusy("submit"); setErr("");
    await inflight.current;
    const { ok, data } = await post<Submit>("/api/worksheet", { action: "submit", slug, sessionId: sid, ...payloadOf(live.current) }, 90_000);
    setBusy("");
    if (!ok) return setErr(data.error ?? "Có lỗi. Bạn thử nộp lại nhé.");
    setAttempt(data.attempt); setLocked(data.locked);
    setResults(Object.fromEntries(data.results.filter((r) => !r.ok).map((r) => [r.step, r])));
    saved.current = ""; serverBlank.current = true; // server xóa nháp khi nộp: lần rời ô sau có nội dung thì phải lưu lại
    setOpen({}); collapseExtras(); // nộp xong đóng hết: nhận xét bước sai hiện sẵn dưới tiêu đề và trong bảng tổng kết
    if (data.done) { setDone({ own: data.own ?? 0, total: data.total ?? prob.steps.length }); top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); document.getElementById("ws-main")?.scrollTo({ top: 0, behavior: "smooth" }); return; }
    window.setTimeout(() => document.getElementById("ws-summary")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
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
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col gap-4 px-4 py-8">
        <Brand tagline />
        <h1>{label}</h1>
        <p className="text-text-muted">Xin chào <b>{who.name}</b> (lớp {who.cls}). Chọn một bài để bắt đầu. Mỗi bài có các bước hướng dẫn, bạn tự giải ra giấy nháp rồi chép kết quả từng bước vào ô.</p>
        <Button variant="ghost" type="button" onClick={changeWho} className="-ml-3 self-start text-sm">Đổi thông tin</Button>
        {err && <Alert tone="danger">{err}</Alert>}
        <ul className="flex flex-col gap-2">
          {problems.map((p, i) => (
            <li key={p.id}>
              <button onClick={() => pickProblem(p)} className="min-h-11 w-full rounded-sm border border-border-strong bg-surface px-4 py-3 text-left hover:bg-primary-soft">
                <span className="font-medium"><span className="tnum mr-2 text-text-muted">{i + 1}.</span>{p.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const n = prob.steps.length;
  const rightCount = locked.length;
  const wrongCount = Object.keys(results).length;
  const stmt = prob.statement.replace(/\n{2,}/g, "\n").trim();
  const guideOn = !!sid && !done;
  const howTo = (
    <section aria-label="Cách làm bài" className="rounded-sm border border-border bg-surface px-4 py-3">
      <h2 className="mb-1 text-sm font-semibold">Cách làm bài</h2>
      <ol className="list-decimal space-y-0.5 pl-5 text-sm">{(isWhole ? GUIDE_WHOLE : GUIDE).map((g) => <li key={g}>{g}</li>)}</ol>
    </section>
  );
  // Chọn kiểu nhập luôn ghim: điện thoại nằm trong khối dính đầu màn hình (gọn một dòng), màn to nằm trên khu cuộn của cột làm bài.
  const styleToggle = (compact: boolean) => (
    <div role="radiogroup" aria-label="Cách nhập bài làm" className="flex flex-col gap-1">
      <div className="grid grid-cols-2 gap-2">
        {([["steps", "Nhập từng bước", "Mỗi bước một ô"], ["whole", "Nhập cả bài", "Một ô cho cả lời giải"]] as const).map(([k, t, d]) => (
          <button key={k} type="button" role="radio" aria-checked={style === k} onClick={() => pickStyle(k)} disabled={submitted || !!busy} className={`cursor-pointer rounded-sm border-2 px-3 text-left disabled:cursor-not-allowed ${compact ? "min-h-10 py-1" : "min-h-12 py-2"} ${style === k ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-primary-soft disabled:opacity-60"}`}>
            <span className="block text-sm font-semibold">{t}</span>
            {!compact && <span className="block text-xs text-text-muted">{d}</span>}
          </button>
        ))}
      </div>
      {submitted && !compact && <p className="text-xs text-text-muted">Đã nộp bài nên không đổi cách nhập nữa.</p>}
    </div>
  );
  // Danh sách hướng dẫn từng bước: render đúng một nơi (cột trái hoặc flyout) tùy kích thước màn hình.
  const guideList = (
    <ol className="flex flex-col gap-3">
      {prob.steps.map((st, i) => (
        <StepGuide
          key={i} i={i} n={n} step={st} ready={guideOn}
          locked={locked.includes(i)} revealed={revealed.includes(i)} revealText={reveals[i]} res={results[i]}
          open={!!open[i]} toggle={() => toggleStep(i)}
          hints={hints} hintOpen={hintOpen} onHint={(l) => hint(i, l)} busy={busy}
          confirm={confirm === i} setConfirm={(v) => setConfirm(v ? i : null)} onReveal={() => reveal(i)}
          ask={asks[i]} setAsk={(a) => setAsks((m) => ({ ...m, [i]: a }))} onAsk={() => ask(i)}
        />
      ))}
    </ol>
  );

  return (
    <>
      {pending && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div role="dialog" aria-modal="true" aria-label="Bài làm dở" className="flex w-full max-w-sm flex-col gap-3 rounded-lg bg-surface p-5 shadow-lg">
            <h2 className="text-base font-semibold">Em đang làm dở bài này</h2>
            <p className="text-text-muted">
              {[pending.done > 0 && `đã làm đúng ${pending.done}/${pending.total} bước`, pending.filled > 0 && (pending.style === "whole" ? "đã viết bài giải chưa nộp" : `đã điền ${pending.filled} bước chưa nộp`)].filter(Boolean).join(", ").replace(/^./, (c) => "Em " + c) || "Em đã bắt đầu bài này"}
              {ago(pending.lastAt) ? ` (${ago(pending.lastAt)})` : ""}. Em muốn làm tiếp hay làm lại từ đầu?
            </p>
            {err && <Alert tone="danger">{err}</Alert>}
            <Button type="button" onClick={resume} disabled={!!busy}>Làm tiếp</Button>
            <Button type="button" variant="secondary" onClick={restart} disabled={!!busy}>Làm lại mới</Button>
            {problems.length > 1 && <Button type="button" variant="ghost" onClick={leave} disabled={!!busy}>← Danh sách bài</Button>}
          </div>
        </div>
      )}

      {showStmt && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/40 lg:hidden" onClick={() => setShowStmt(false)}>
          <div role="dialog" aria-label="Đề bài" className="max-h-[75dvh] overflow-y-auto rounded-t-xl bg-surface px-4 pb-6 pt-3 text-base" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">Đề bài</h2>
              <Button variant="ghost" type="button" onClick={() => setShowStmt(false)} className="-mr-3 text-sm">Đóng</Button>
            </div>
            <MathText text={stmt} />
          </div>
        </div>
      )}

      {showHints && guideOn && !wide && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/40" onClick={() => setShowHints(false)}>
          <div role="dialog" aria-label="Hướng dẫn và gợi ý" className="max-h-[70dvh] overflow-y-auto overscroll-contain rounded-t-xl bg-bg px-4 pb-6 pt-3 text-base" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">💡 Hướng dẫn và gợi ý</h2>
              <Button variant="ghost" type="button" onClick={() => setShowHints(false)} className="-mr-3 text-sm">Đóng</Button>
            </div>
            {guideList}
          </div>
        </div>
      )}

      {guideOn && !wide && !showHints && !typing && (
        <button type="button" onClick={() => setShowHints(true)} aria-label="Mở hướng dẫn và gợi ý" className="fixed right-4 z-20 grid size-14 cursor-pointer place-items-center rounded-full bg-primary text-2xl text-on-primary shadow-lg active:scale-95" style={{ bottom: "calc(env(safe-area-inset-bottom) + 7rem)" }}>💡</button>
      )}

      <div className="mx-auto max-w-2xl px-4 pb-36 pt-3 text-base lg:flex lg:h-[100dvh] lg:max-w-6xl lg:flex-col lg:overflow-hidden lg:pb-3">
        <div ref={top} />
        <header className="flex items-center justify-between gap-2">
          <Brand size="sm" />
          {problems.length > 1 && <Button variant="ghost" type="button" onClick={leave} className="-mr-3 text-sm">← Danh sách bài</Button>}
        </header>
        <h1 className="mb-3 mt-2 text-lg">{prob.title}</h1>

        <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch lg:gap-6">
        {/* Đề bài luôn ghim: điện thoại dính đầu màn hình (cuộn riêng bên trong, bấm "Xem đủ" mở bảng trượt); màn hình rộng là cột trái dính, kèm cách làm bài và hướng dẫn từng bước. */}
        <aside aria-label="Đề bài và hướng dẫn" className="sticky top-0 z-10 -mx-4 bg-bg px-4 py-2 shadow-sm lg:static lg:order-1 lg:mx-0 lg:flex lg:h-full lg:w-2/5 lg:shrink-0 lg:flex-col lg:overflow-hidden lg:bg-transparent lg:p-0 lg:shadow-none">
          <div className="rounded-sm border border-border border-l-4 border-l-primary bg-primary-soft px-3 py-2 lg:max-h-[40%] lg:shrink-0 lg:overflow-y-auto lg:px-4 lg:py-3 lg:text-base">
            <div className="flex h-7 items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">Đề bài</h2>
              <button type="button" onClick={() => setShowStmt(true)} className="-mr-2 h-7 cursor-pointer rounded-sm px-2 text-xs font-medium text-primary hover:bg-surface lg:hidden">Xem đủ</button>
            </div>
            <div className={`overflow-y-auto overscroll-contain leading-tight lg:max-h-none lg:overflow-visible lg:leading-normal [&_.katex-display]:my-0.5 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden ${typing ? "max-lg:max-h-[12dvh]" : "max-lg:max-h-[22dvh]"}`}><MathText text={stmt} /></div>
          </div>
          {guideOn && <div className="mt-2 lg:hidden">{styleToggle(true)}</div>}
          {!done && <div className="mt-4 hidden min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pb-4 lg:flex">{howTo}{guideOn && wide && guideList}</div>}
        </aside>

        <div className="min-w-0 flex-1 lg:order-2 lg:flex lg:h-full lg:flex-col lg:gap-3">
        {guideOn && <div className="hidden lg:block">{styleToggle(false)}</div>}
        <main id="ws-main" className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
        {err && !pending && <Alert tone="danger">{err}</Alert>}
        {err && !sid && !pending && !busy && <Button type="button" variant="secondary" onClick={() => pickProblem(prob)}>Thử lại</Button>}

        {done ? (
          <div className="flex flex-col gap-3">
            <Alert tone="success">Em đã làm đúng cả {done.total} bước. Số bước tự làm (không xem đáp án): {done.own}/{done.total}. Cảm ơn em.</Alert>
            {problems.length > 1 && <Button variant="secondary" type="button" onClick={leave}>Chọn bài khác</Button>}
          </div>
        ) : (
          <div className="lg:hidden">{howTo}</div>
        )}

        {!sid && !err && <OpeningSteps steps={prob.steps} waiting={busy === "start"} />}

        {sid && !done && wrongCount > 0 && (
          <section id="ws-summary" role="alert" className="scroll-mt-[calc(22dvh+4rem)] rounded-sm border-2 border-danger bg-danger-soft p-3 lg:scroll-mt-3">
            <p className="text-base font-bold text-danger">⚠ Đúng {rightCount}/{n} bước. Cần sửa {wrongCount} bước:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.keys(results).map(Number).sort((a, b) => a - b).map((s) => (
                <button key={s} type="button" onClick={() => goStep(s)} className="min-h-11 cursor-pointer rounded-sm border-2 border-danger bg-surface px-3 text-sm font-semibold text-danger hover:bg-danger hover:text-surface active:bg-danger active:text-surface">Bước {s + 1}</button>
              ))}
            </div>
          </section>
        )}

        {sid && (
          <ol className="flex flex-col gap-3">
            {prob.steps.map((st, i) => (
              <AnswerCard
                key={i} i={i} n={n} step={st} ready={guideOn} whole={isWhole}
                answer={answers[i] ?? ""} setAnswer={(v) => setAnswers((a) => a.map((x, k) => (k === i ? v : x)))}
                locked={locked.includes(i)} revealed={revealed.includes(i)} res={results[i]}
                onGuide={() => showGuide(i)} onFocus={() => { selectStep(i); if (wide) scrollTo(`guide-${i}`, "start"); }}
                onBlur={() => void saveDraft(i)} draftState={draft?.step === i ? draft.state : undefined}
              />
            ))}
          </ol>
        )}

        {sid && !done && isWhole && (
          <section aria-label="Bài giải cả bài" className="flex flex-col gap-1 rounded-sm border-2 border-primary bg-surface p-3">
            <label htmlFor="ws-whole" className="text-sm font-semibold">✏️ Lời giải cả bài</label>
            <textarea
              id="ws-whole" ref={wholeBox} rows={9} value={whole} onChange={(e) => setWhole(e.target.value)} onBlur={() => void saveDraft(-1)} maxLength={WHOLE_MAX}
              autoCapitalize="off" autoCorrect="off" spellCheck={false}
              placeholder={"Chép lời giải của bạn vào đây, mỗi ý một dòng, theo thứ tự các bước.\nVí dụ:\nBước 1: ...\nBước 2: ..."}
              className="min-h-48 w-full resize-y rounded-sm border-2 border-primary bg-surface px-3 py-2 text-base"
            />
            <div className="flex flex-wrap items-center gap-2">
              <FormulaButton target={wholeBox} value={whole} onChange={setWhole} disabled={!!done} />
              {draft?.step === -1 && <span role="status" className={`text-xs ${draft.state === "error" ? "font-semibold text-danger" : "text-text-muted"}`}>{draft.state === "saving" ? "Đang lưu nháp..." : draft.state === "saved" ? "✓ Đã lưu nháp" : "Chưa lưu được nháp, kiểm tra mạng"}</span>}
              {whole.length >= WHOLE_MAX - 200 && <span className="tnum ml-auto text-xs text-danger">{whole.length}/{WHOLE_MAX}</span>}
            </div>
            {whole.includes("$") && <div className="rounded-sm border border-border bg-primary-soft px-3 py-2 text-sm"><span className="block text-xs text-text-muted">Xem trước</span><MathText text={whole} /></div>}
          </section>
        )}
        </main>

      {/* Thanh nộp bài: điện thoại dính đáy màn hình; màn to nằm cuối cột làm bài (cột này không cuộn cả trang, chỉ cuộn khu vực trên nó). */}
      {sid && !done && (
        <div className={`fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:static lg:shrink-0 lg:border-0 lg:bg-transparent lg:pb-0 ${typing ? "max-sm:hidden" : ""}`}>
          <div className="mx-auto max-w-2xl px-4 pt-2 lg:max-w-none lg:p-0">
            <div className="flex min-w-0 flex-1 flex-col gap-1 lg:rounded-sm lg:border lg:border-border lg:bg-surface lg:p-3 lg:shadow-sm">
              <p className="text-sm" aria-live="polite">
                {attempt > 0 && <span className="font-medium">Đúng {rightCount}/{n} bước{wrongCount ? `, cần sửa ${wrongCount} bước. ` : ". "}</span>}
                {isWhole && !whole.trim() ? <span className="text-text-muted">Viết lời giải vào ô cả bài rồi nộp.</span> : need.length === 0 ? <span className="text-text-muted">{attempt > 0 ? "Sửa các bước chưa đúng rồi nộp lại." : isWhole ? "Đã viết bài giải." : "Đã điền đủ các bước."}</span> : <span className="text-text-muted">Còn thiếu bước {need.map((k) => k + 1).join(", ")}.</span>}
              </p>
              <Button type="button" onClick={submit} disabled={!ready || !!busy} pending={busy === "submit" ? "Đang chấm bài..." : undefined}>{attempt > 0 ? "Nộp lại" : "Nộp bài"}</Button>
            </div>
          </div>
        </div>
      )}
        </div>
        </div>
      </div>
    </>
  );
}

// Đang mở bài (kiểm tra làm dở, tạo phiên): hiện đủ số thẻ bước đúng kích thước thẻ thật (việc cần làm đã có sẵn từ server) nên danh sách không giật khi tải xong,
// kèm dòng trạng thái rõ ràng. Chờ lâu thì đổi lời nhắc để học sinh biết vẫn đang chạy.
function OpeningSteps({ steps, waiting }: { steps: WsStep[]; waiting: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setSlow(true), 6000); return () => window.clearTimeout(t); }, []);
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div role="status" className="flex items-center gap-3 rounded-sm border-2 border-primary bg-primary-soft px-4 py-3 text-base font-semibold text-primary">
        <span className="spinner !size-5 !border-[3px]" aria-hidden="true" />
        <span>{waiting ? (slow ? "Mạng hơi chậm, vẫn đang mở bài…" : "Đang mở bài, chờ chút nhé…") : "Đang chờ bạn chọn làm tiếp hay làm mới…"}</span>
      </div>
      <ol className="flex flex-col gap-3" aria-hidden="true">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 rounded-sm border-2 border-border bg-surface px-3 py-3 opacity-80">
            <span className="skeleton mt-1 size-5 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="flex items-center gap-2"><span className="font-semibold text-text-muted">Bước {i + 1}/{steps.length}</span><span className="skeleton h-5 w-16 !rounded-full" /></span>
              {s.goal ? <span className="line-clamp-2 text-sm text-text-muted"><MathText text={s.goal} /></span> : <span className="skeleton h-4 w-3/4" />}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type Shared = { i: number; n: number; step: WsStep; locked: boolean; revealed: boolean; res?: Res };
type GuideProps = Shared & {
  ready: boolean; revealText?: string; open: boolean; toggle: () => void;
  hints: Record<string, string>; hintOpen: Record<string, boolean>; onHint: (lvl: number) => void; busy: string;
  confirm: boolean; setConfirm: (v: boolean) => void; onReveal: () => void;
  ask?: AskState; setAsk: (a: AskState) => void; onAsk: () => void;
};
type AnswerProps = Shared & {
  ready: boolean; whole: boolean; // whole: kiểu nhập cả bài, thẻ bước không có ô đáp án riêng
  answer: string; setAnswer: (v: string) => void;
  onBlur: () => void; onFocus: () => void; draftState?: Draft["state"]; // lưu nháp khi rời ô đáp án; focus thì chọn hướng dẫn của bước
  onGuide: () => void;
};

const Chevron = ({ up }: { up?: boolean }) => <svg aria-hidden="true" viewBox="0 0 20 20" className={`size-4 transition-transform ${up ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7l6 6 6-6" /></svg>;
const Lock = () => <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V6a3 3 0 0 1 6 0v3" /></svg>;

// Hướng dẫn của một bước: việc cần làm, cách viết, 3 gợi ý, xem đáp án, hỏi. Nằm ở cột trái (màn to) hoặc trong flyout (điện thoại).
function StepGuide(p: GuideProps) {
  const { i, n, step } = p;
  const wrong = !!p.res && !p.locked;
  const ask = p.ask ?? { open: false, text: "", reply: "", q: "" };
  const busyHere = p.busy.endsWith(`:${i}`) || p.busy.startsWith(`hint:${i}:`);
  return (
    <li id={`guide-${i}`} className={`scroll-mt-2 rounded-sm border-2 ${p.locked ? "border-success bg-success-soft" : wrong ? "border-danger bg-danger-soft" : p.open ? "border-primary bg-surface" : "border-border bg-surface"}`}>
      <button type="button" onClick={p.toggle} aria-expanded={p.open} aria-controls={`guide-body-${i}`} title={p.open ? "Đóng hướng dẫn bước này" : "Mở hướng dẫn bước này"} className="flex min-h-12 w-full cursor-pointer items-start gap-3 rounded-sm px-3 py-3 text-left hover:bg-primary-soft active:bg-primary-soft">
        <svg aria-hidden="true" viewBox="0 0 20 20" className={`mt-1 size-5 shrink-0 text-primary transition-transform ${p.open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4l6 6-6 6" /></svg>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">Bước {i + 1}/{n}</span>{p.locked && <Badge tone="success">✓ Đúng</Badge>}{wrong && <span className="inline-block whitespace-nowrap rounded-full bg-danger px-3 py-1 text-sm font-bold text-surface">✗ Cần sửa</span>}{p.revealed && <Badge tone="warn">Đã xem đáp án, không tính điểm</Badge>}</span>
          {step.goal && !p.open && <span className="line-clamp-2 text-sm text-text-muted"><MathText text={step.goal} /></span>}
        </span>
      </button>

      {p.open && (
        <div id={`guide-body-${i}`} className="flex flex-col gap-3 border-t border-border px-3 pb-3 pt-3">
          {step.goal && <div><span className="text-xs font-semibold uppercase tracking-wide text-primary">Việc cần làm</span><div><MathText text={step.goal} /></div></div>}
          {step.format && <p className="text-sm text-text-muted"><b>Cách viết:</b> <MathText text={step.format} /></p>}

          {!p.locked && (
            <div className="flex flex-col gap-2" role="group" aria-label={`Gợi ý bước ${i + 1}`}>
              {Array.from({ length: HINTS }, (_, k) => k + 1).map((l) => {
                const key = `${i}:${l}`;
                const text = p.hints[key];
                const shown = !!text && !!p.hintOpen[key];
                const prevOk = l === 1 || !!p.hints[`${i}:${l - 1}`];
                const lockedHint = !prevOk; // phải mở gợi ý trước mới mở được gợi ý này
                const loading = p.busy === `hint:${key}`;
                return (
                  <div key={l} title={lockedHint ? "Mở gợi ý trước đã" : undefined} className={`overflow-hidden rounded-sm border-2 bg-surface ${lockedHint ? "border-border" : shown ? "border-primary" : "border-primary/40"}`}>
                    <button type="button" onClick={() => p.onHint(l)} disabled={lockedHint || !p.ready || (!!p.busy && !loading)} aria-expanded={shown} className={`group flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left text-base font-semibold ${lockedHint ? "cursor-not-allowed bg-bg text-text-muted" : "cursor-pointer text-primary hover:bg-primary-soft active:bg-primary-soft disabled:cursor-wait"}`}>
                      <span>💡 {l === 1 ? "Gợi ý 1" : `Chưa rõ? Gợi ý ${l}`}{lockedHint && <span className="ml-1 text-sm font-normal">(mở gợi ý {l - 1} trước)</span>}</span>
                      <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full ${lockedHint ? "bg-border text-text-muted" : "bg-primary text-on-primary group-hover:scale-110"} transition-transform`}>{loading ? "…" : lockedHint ? <Lock /> : <Chevron up={shown} />}</span>
                    </button>
                    {shown && <div className="border-t-2 border-primary bg-primary-soft px-3 py-3 text-base"><MathText text={text} /></div>}
                  </div>
                );
              })}
            </div>
          )}

          {!p.locked && (
            <div className="flex flex-col gap-2">
              {p.revealText ? (
                <div className="rounded-sm border border-warning bg-warning-soft px-3 py-2 text-sm"><span className="font-semibold">Đáp án bước {i + 1} (bước này không tính điểm):</span> <MathText text={p.revealText} /></div>
              ) : p.revealed ? (
                <Button type="button" variant="secondary" onClick={p.onReveal} disabled={!p.ready || !!p.busy} className="text-sm">Xem lại đáp án (không tính điểm)</Button>
              ) : p.confirm ? (
                <div className="flex flex-col gap-2 rounded-sm border border-warning bg-warning-soft px-3 py-2 text-sm" role="alertdialog" aria-label="Xác nhận xem đáp án">
                  <p>Xem đáp án thì <b>bước này sẽ không được tính điểm</b>. Bạn vẫn cần chép đáp án vào ô để nộp bài. Bạn muốn xem không?</p>
                  <div className="flex gap-2">
                    <Button type="button" onClick={p.onReveal} pending={p.busy === `reveal:${i}` ? "Đang mở..." : undefined} disabled={!!p.busy} block={false} className="text-sm">Vẫn xem đáp án</Button>
                    <Button type="button" variant="secondary" onClick={() => p.setConfirm(false)} disabled={!!p.busy} block={false} className="text-sm">Không xem</Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="secondary" onClick={() => p.setConfirm(true)} disabled={!p.ready || !!p.busy} className="text-sm">Xem đáp án bước này (không tính điểm)</Button>
              )}

              <Button type="button" variant="ghost" onClick={() => p.setAsk({ ...ask, open: !ask.open })} aria-expanded={ask.open} className="self-start text-sm">❓ Em chưa hiểu bước này</Button>
              {ask.open && (
                <div className="flex flex-col gap-2 rounded-sm border-2 border-warning bg-warning-soft p-2">
                  <label htmlFor={`ask-${i}`} className="text-sm font-semibold">Bạn chưa hiểu chỗ nào ở bước này?</label>
                  <textarea id={`ask-${i}`} rows={2} value={ask.text} onChange={(e) => p.setAsk({ ...ask, text: e.target.value })} maxLength={ASK_MAX} disabled={!!p.busy} placeholder="Ví dụ: Vì sao phải làm phép này?" className="w-full resize-y rounded-sm border border-warning bg-surface px-3 py-2 text-base" />
                  <Button type="button" onClick={p.onAsk} disabled={!ask.text.trim() || !!p.busy} pending={p.busy === `ask:${i}` ? "Đang trả lời..." : undefined} className="text-sm">Gửi câu hỏi</Button>
                  {ask.reply && (
                    <div id={`reply-${i}`} className="flex scroll-mb-8 scroll-mt-2 flex-col gap-2">
                      {ask.q && <p className="text-sm text-text-muted">Bạn hỏi: “{ask.q}”</p>}
                      <div className="rounded-sm border-2 border-l-8 border-primary bg-primary-soft px-3 py-3 text-base shadow-sm">
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-primary">💬 MathStep trả lời</p>
                        <MathText text={ask.reply} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {p.locked && <p className="text-sm font-medium text-success">Bước này đã đúng, được giữ lại.{p.revealed ? " Vì đã xem đáp án nên bước này không tính điểm." : ""}</p>}
          {busyHere && <span className="sr-only" aria-live="polite">Đang xử lý</span>}
        </div>
      )}
    </li>
  );
}

// Thẻ trả lời của một bước (cột phải / màn chính): tiêu đề, việc cần làm, nhận xét nếu sai, ô đáp án. Ô luôn hiện, không cần mở.
function AnswerCard(p: AnswerProps) {
  const box = useRef<HTMLTextAreaElement>(null);
  const { i, n, step } = p;
  const filled = !!p.answer.trim();
  const wrong = !!p.res && !p.locked;
  const status = p.locked ? <Badge tone="success">✓ Đúng</Badge> : wrong ? <span className="inline-block whitespace-nowrap rounded-full bg-danger px-3 py-1 text-sm font-bold text-surface">✗ Cần sửa</span> : p.whole ? <Badge tone="neutral">Chưa chấm</Badge> : filled ? <Badge tone="info">Đã điền</Badge> : <Badge tone="neutral">Chưa điền</Badge>;
  return (
    <li id={`step-${i}`} className={`scroll-mt-[calc(22dvh+4rem)] rounded-sm border-2 lg:scroll-mt-3 ${p.whole && !p.res && !p.locked ? "hidden" : ""} ${p.locked ? "border-success bg-success-soft" : wrong ? "border-danger bg-danger-soft" : "border-border bg-surface"}`}>
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
        <span className="font-semibold">Bước {i + 1}/{n}</span>{status}{p.revealed && <Badge tone="warn">Đã xem đáp án, không tính điểm</Badge>}
        <button type="button" onClick={p.onGuide} aria-label={`Xem hướng dẫn và gợi ý bước ${i + 1}`} className={`ml-auto min-h-9 cursor-pointer ${p.whole ? "hidden" : ""} rounded-full border-2 border-primary/40 px-3 text-sm font-semibold text-primary hover:bg-primary-soft active:bg-primary-soft`}>💡 Gợi ý</button>
      </div>
      {step.goal && <div className="line-clamp-3 px-3 pt-1 text-sm text-text-muted"><MathText text={step.goal} /></div>}
      {/* Nhận xét bước sai luôn hiện ngay dưới tiêu đề, nổi bật để học sinh thấy ngay. */}
      {wrong && (
        <div role="alert" className="mx-3 mt-3 flex items-start gap-3 rounded-sm border-2 border-danger bg-surface px-3 py-3">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-danger text-lg font-bold text-surface">!</span>
          <div className="min-w-0">
            <p className="text-base font-bold text-danger">Bước {i + 1} chưa đúng</p>
            <div className="text-base"><MathText text={p.res!.note} /></div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 px-3 pb-3 pt-2">
        {!p.whole && <>
          <label htmlFor={`ans-${i}`} className="text-sm font-medium">✏️ Đáp án bước {i + 1}</label>
          <textarea
            id={`ans-${i}`} ref={box} rows={2} value={p.answer} onChange={(e) => p.setAnswer(e.target.value)} onBlur={p.onBlur} onFocus={p.onFocus} maxLength={ANSWER_MAX}
            readOnly={p.locked} disabled={!p.ready && !p.locked} autoCapitalize="off" autoCorrect="off" spellCheck={false}
            placeholder={step.example ? `Ví dụ: ${step.example}` : "Viết đáp án của bước này"}
            className={`min-h-16 w-full resize-y rounded-sm border-2 px-3 py-2 text-base ${p.locked ? "border-success bg-success-soft" : p.res ? "border-danger bg-surface" : "border-primary bg-surface"}`}
          />
          {!p.locked && (
            <div className="flex flex-wrap items-center gap-2">
              <FormulaButton target={box} value={p.answer} onChange={p.setAnswer} disabled={!p.ready} />
              {p.draftState && <span role="status" className={`text-xs ${p.draftState === "error" ? "font-semibold text-danger" : "text-text-muted"}`}>{p.draftState === "saving" ? "Đang lưu nháp..." : p.draftState === "saved" ? "✓ Đã lưu nháp" : "Chưa lưu được nháp, kiểm tra mạng"}</span>}
              {p.answer.length >= ANSWER_MAX - 50 && <span className="tnum ml-auto text-xs text-danger">{p.answer.length}/{ANSWER_MAX}</span>}
            </div>
          )}
          {!p.locked && p.answer.includes("$") && <div className="rounded-sm border border-border bg-primary-soft px-3 py-2 text-sm"><span className="block text-xs text-text-muted">Xem trước</span><MathText text={p.answer} /></div>}
        </>}
        {p.locked && <p className="text-sm font-medium text-success">Bước này đã đúng, được giữ lại.{p.revealed ? " Vì đã xem đáp án nên bước này không tính điểm." : ""}</p>}
      </div>
    </li>
  );
}
