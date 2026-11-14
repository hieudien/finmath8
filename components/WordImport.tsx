"use client";
import { useRef, useState } from "react";
import { AiButton, Alert, Badge, Button, Confirm, GradeSelect, TextArea, post, toast, useRefresh } from "@/components/ui";
import { MathText } from "@/components/MathText";
import { ListSearch } from "@/components/ListSearch";
import { matchText } from "@/lib/search";
import { CHUNK, PAR } from "@/lib/batch";
import { readDocx } from "@/lib/docx-read";
import { answersToLines } from "@/lib/answers";
import { looseAnswers, type Fail, type ItemStatus, type ItemView } from "@/lib/import-batch";

// Nạp đề hàng loạt từ tệp Word: 1) chọn tệp và lớp, 2) xem trước và sửa, 3) bấm dùng AI (lưu nháp từng lượt), 4) xem kết quả rồi xác nhận mới lưu vào danh sách đề.
type Row = ItemView & { statement: string; answers: Record<string, unknown> };
export type DraftBatch = { id: string; file_name: string; grade: number; items: Row[]; read_errors: Fail[] };
type Pre = { statement: string; answers: string; steps: string[]; warnings: string[]; from: string };
type ReadReply = { items: { statement: string; solution: Record<string, unknown>; solution_steps: string[]; warnings: string[] }[] };
type PhaseReply = { left: number[]; view: ItemView[] };

const TONE: Record<ItemStatus, { tone: "success" | "warn" | "danger" | "info" | "neutral"; text: string }> = {
  ok: { tone: "success", text: "Đạt chuẩn" }, review: { tone: "warn", text: "Cần xem lại" }, failed: { tone: "danger", text: "Lỗi" },
  drafted: { tone: "info", text: "Chờ viết lời giải" }, pending: { tone: "neutral", text: "Chưa làm" },
};
const eta = (n: number) => { const m = Math.max(1, Math.round((n * 55) / PAR / 60)); return m >= 90 ? `${(m / 60).toFixed(1).replace(".", ",")} giờ` : `${m} phút`; };

export default function WordImport({ draft }: { draft: DraftBatch | null }) {
  const [rp, refresh] = useRefresh();
  const [grade, setGrade] = useState("");
  const [fileName, setFileName] = useState("");
  const [pre, setPre] = useState<Pre[] | null>(null);
  const [errs, setErrs] = useState<Fail[]>([]);
  const [sourceN, setSourceN] = useState(0);
  const [batch, setBatch] = useState<{ id: string; file: string; grade: number; rows: Row[]; errs: Fail[] } | null>(draft && { id: draft.id, file: draft.file_name, grade: draft.grade, rows: draft.items, errs: draft.read_errors });
  const [prog, setProg] = useState<{ label: string; done: number; total: number } | null>(null);
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const stop = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const running = !!prog;

  async function readFile(f: File) {
    setBusy("Đang mở tệp..."); setPre(null); setErrs([]); setFileName(f.name);
    try {
      const { sources, skipped } = await readDocx(await f.arrayBuffer());
      const errors: Fail[] = skipped.map((reason) => ({ name: "Tệp", reason }));
      if (!sources.length) { setErrs(errors); toast("danger", "Tệp không có chữ hoặc ảnh đọc được."); return; }
      setSourceN(sources.length);
      const found: Pre[][] = sources.map(() => []);
      let next = 0, done = 0, hard = "";
      setProg({ label: "Đọc tệp", done: 0, total: sources.length });
      await Promise.all(Array.from({ length: Math.min(PAR, sources.length) }, async () => {
        while (next < sources.length && !hard) {
          const i = next++, s = sources[i];
          const { ok, data } = await post<ReadReply>("/api/problems", s.kind === "image" ? { action: "read_items", image: s.dataUrl } : { action: "read_items", text: s.text });
          if (!ok) { errors.push({ name: s.name, reason: data.error ?? "Có lỗi." }); if (/API key/.test(data.error ?? "")) hard = data.error!; }
          else found[i] = data.items.map((x) => ({ statement: x.statement, answers: answersToLines(x.solution), steps: x.solution_steps, warnings: x.warnings, from: s.name }));
          setProg({ label: "Đọc tệp", done: ++done, total: sources.length });
        }
      }));
      setErrs(errors);
      const all = found.flat();
      setPre(all);
      if (!all.length) toast("danger", "Không đọc được đề nào từ tệp.");
    } catch (e) {
      toast("danger", e instanceof Error && /Word|zip|end of central/i.test(e.message) ? "Không phải tệp Word (.docx) hợp lệ." : "Không mở được tệp.");
    } finally { setProg(null); setBusy(""); if (file.current) file.current.value = ""; }
  }

  // Gửi từng lượt tối đa CHUNK đề cho hai pha; kết quả ghi vào đợt nháp ở server sau mỗi lượt. Đề đã thử trong lần chạy này không thử lại (tránh lặp vô hạn với đề lỗi).
  async function run(id: string, start: Row[]) {
    let view = start, hard = "";
    stop.current = false;
    const total = view.length;
    const finished = () => view.filter((r) => r.status === "ok" || r.status === "review" || r.status === "failed").length;
    for (const phase of ["batch_make", "batch_finish"] as const) {
      const tried = new Set<number>();
      const need = () => view.flatMap((r, i) => (tried.has(i) ? [] : phase === "batch_make" ? (r.status === "pending" || (r.status === "failed" && !r.drafted) ? [i] : []) : (r.drafted && (r.status === "drafted" || r.status === "failed") ? [i] : [])));
      for (let n = need(); n.length && !stop.current && !hard; n = need()) {
        setProg({ label: phase === "batch_make" ? "AI đọc đề" : "AI viết lời giải và chỉ dẫn", done: finished(), total });
        const idx = n.slice(0, CHUNK);
        const { ok, data } = await post<PhaseReply>("/api/problems", { action: phase, id, idx });
        if (!ok) { hard = data.error ?? "Có lỗi."; break; }
        idx.filter((i) => !data.left.includes(i)).forEach((i) => tried.add(i));
        if (data.left.length === idx.length) { hard = "Máy chủ chưa làm được đề nào trong lượt này. Thử lại sau."; break; }
        view = view.map((r, i) => ({ ...r, ...data.view[i] }));
        setBatch((b) => b && { ...b, rows: view });
      }
      if (hard || stop.current) break;
    }
    setProg(null);
    const f = (s: ItemStatus) => view.filter((r) => r.status === s).length;
    toast(hard || f("failed") ? "warning" : "success", hard ? `Dừng: ${hard}` : stop.current ? "Đã dừng. Đề đã làm được giữ trong bản nháp." : `Xong: ${f("ok")} đạt chuẩn, ${f("review")} cần xem lại, ${f("failed")} lỗi.`);
  }

  async function start() {
    if (!pre) return;
    const items = pre.filter((x) => x.statement.trim().length >= 15).map((x) => ({ statement: x.statement.trim(), answers: looseAnswers(x.answers), steps: x.steps }));
    if (!items.length) return toast("danger", "Chưa có đề nào đủ dài để tạo.");
    setBusy("Đang tạo đợt...");
    const { ok, data } = await post<{ id: string }>("/api/problems", { action: "batch_start", file_name: fileName, grade: Number(grade), sources: sourceN, read_errors: errs, items });
    setBusy("");
    if (!ok) return toast("danger", data.error ?? "Có lỗi.");
    const rows: Row[] = items.map((x) => ({ statement: x.statement, answers: x.answers, status: "pending", reason: "", title: "", code: "", drafted: false }));
    setBatch({ id: data.id, file: fileName, grade: Number(grade), rows, errs });
    setPre(null);
    await run(data.id, rows);
  }

  async function confirm() {
    if (!batch) return;
    setBusy("Đang lưu...");
    const { ok, data } = await post<{ saved: number }>("/api/problems", { action: "batch_confirm", id: batch.id });
    setBusy("");
    if (!ok) return toast("danger", data.error ?? "Có lỗi.");
    toast("success", `Đã lưu ${data.saved} đề, chưa khóa đáp án. Mở từng đề kiểm tra đề bài, lời giải, đáp án rồi xác nhận (nhãn "Chưa xác nhận đáp án") trước khi tạo liên kết.`);
    setBatch(null); refresh();
  }

  // ---- Kết quả của đợt nháp ----
  if (batch) {
    const rows = batch.rows, n = (s: ItemStatus) => rows.filter((r) => r.status === s).length;
    const saveable = n("ok") + n("review"), redo = n("pending") + n("drafted") + n("failed");
    return (
      <section aria-label="Kết quả nạp đề" className="flex flex-col gap-3">
        <h3>Bản nháp từ {batch.file || "tệp Word"} · lớp {batch.grade}</h3>
        <p className="text-sm text-text-muted">{rows.length} đề: {n("ok")} đạt chuẩn, {n("review")} cần xem lại, {n("failed")} lỗi{n("pending") + n("drafted") ? `, ${n("pending") + n("drafted")} chưa làm xong` : ""}. Đề chỉ vào danh sách khi bạn bấm Lưu.</p>
        {prog && (
          <div aria-live="polite" className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <p className="font-medium">{prog.label}: {prog.done}/{prog.total}</p>
            <progress className="h-3 w-full accent-primary" value={prog.done} max={prog.total} aria-label={prog.label} />
            <div><Button variant="secondary" block={false} onClick={() => { stop.current = true; }}>Dừng sau lượt này</Button></div>
          </div>
        )}
        {batch.errs.length > 0 && <Alert tone="warning">Lúc đọc tệp có {batch.errs.length} lỗi: {batch.errs.map((e) => `${e.name}: ${e.reason}`).join(" | ")}</Alert>}
        <ListSearch value={q} onChange={setQ} shown={rows.filter((r) => matchText(`${r.title} ${r.statement} ${r.reason}`, q)).length} total={rows.length} />
        {q.trim() && !rows.some((r) => matchText(`${r.title} ${r.statement} ${r.reason}`, q)) && <p className="text-sm text-text-muted">Không có đề nào khớp.</p>}
        {q.trim() && <p className="text-sm text-text-muted">Các số đếm và nút Lưu ở trên và dưới tính trên cả đợt, không theo ô tìm.</p>}
        <ul className="max-h-[60dvh] divide-y divide-border overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface">
          {rows.map((r, i) => matchText(`${r.title} ${r.statement} ${r.reason}`, q) && (
            <li key={i} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tnum text-text-muted">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate font-medium">{r.title || r.statement.slice(0, 70)}</span>
                {Object.keys(r.answers).length > 0 && <Badge tone="info">Đáp số từ tệp</Badge>}
                <Badge tone={TONE[r.status].tone}>{TONE[r.status].text}</Badge>
              </div>
              {r.reason && <p className="text-sm text-text-muted">{r.reason}</p>}
              <details className="text-sm">
                <summary className="cursor-pointer text-primary">Xem đề</summary>
                <div className="mt-2 flex flex-col gap-1"><MathText text={r.statement} />{Object.keys(r.answers).length > 0 && <p className="text-text-muted">Đáp số: {answersToLines(r.answers).replaceAll("\n", "; ")}</p>}</div>
              </details>
            </li>
          ))}
        </ul>
        <p className="text-sm text-text-muted">Đề lưu ra có nhãn &ldquo;Chưa xác nhận đáp án&rdquo; và chưa tạo liên kết được cho tới khi bạn tự kiểm tra và xác nhận từng đề.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button onClick={confirm} disabled={running || saveable === 0} pending={busy || (rp ? "Đang cập nhật..." : undefined)}>{saveable ? `Xác nhận, lưu ${saveable} đề` : "Chưa có đề nào để lưu"}</Button>
          {redo > 0 && <AiButton variant="secondary" disabled={running} onClick={() => run(batch.id, rows)}>{`Chạy tiếp ${redo} đề chưa xong hoặc lỗi`}</AiButton>}
          <Confirm label="Hủy đợt" confirmLabel="Hủy đợt" message="Bản nháp bị bỏ, không đề nào được lưu. Đợt vẫn còn trong lịch sử." onConfirm={async () => {
            const { ok, data } = await post("/api/problems", { action: "batch_cancel", id: batch.id });
            if (!ok) return data.error ?? "Có lỗi.";
            setBatch(null);
          }} />
        </div>
      </section>
    );
  }

  // ---- Xem trước ----
  if (pre && pre.length) {
    const withAns = pre.filter((x) => Object.keys(looseAnswers(x.answers)).length).length;
    return (
      <section aria-label="Xem trước" className="flex flex-col gap-3">
        <h3>Xem trước: {pre.length} đề từ {fileName}</h3>
        <Alert tone="info">Kiểm tra từng đề. Đề có đáp số thì AI viết lời giải theo đáp số đó; đề để trống thì AI tự giải. Mọi đề đều <strong>chưa được khóa</strong>: sau khi lưu, bạn phải tự mở từng đề kiểm tra đề bài, lời giải, đáp án rồi xác nhận đáp án mới tạo được liên kết. Dự kiến khoảng {eta(pre.length)}. Đã có {withAns}/{pre.length} đề có đáp số.</Alert>
        {errs.length > 0 && <Alert tone="warning">{errs.length} nguồn đọc lỗi: {errs.map((e) => `${e.name}: ${e.reason}`).join(" | ")}</Alert>}
        <ul className="flex flex-col gap-3">
          {pre.map((x, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center justify-between gap-2"><strong>Đề {i + 1}</strong><span className="text-sm text-text-muted">{x.from}</span><Button variant="ghost" block={false} className="text-danger" onClick={() => setPre(pre.filter((_, k) => k !== i))}>Bỏ đề này</Button></div>
              <div className="rounded-sm bg-primary-soft p-2"><MathText text={x.statement} /></div>
              <TextArea label="Đề bài (sửa nếu đọc sai)" rows={3} value={x.statement} onChange={(e) => setPre(pre.map((y, k) => (k === i ? { ...y, statement: e.target.value } : y)))} />
              <TextArea label="Đáp số (mỗi dòng: tên = giá trị, ví dụ x1 = 15)" rows={2} value={x.answers} placeholder="Để trống nếu chưa có, AI sẽ tự giải" onChange={(e) => setPre(pre.map((y, k) => (k === i ? { ...y, answers: e.target.value } : y)))} />
              {x.warnings.length > 0 && <Alert tone="warning">{x.warnings.join(" ")}</Alert>}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <AiButton onClick={start} disabled={!grade || running} pending={busy || undefined}>{`Dùng AI tạo ${pre.length} đề`}</AiButton>
          <Button variant="secondary" onClick={() => setPre(null)} disabled={running}>Chọn tệp khác</Button>
        </div>
      </section>
    );
  }

  // ---- Chọn tệp ----
  return (
    <section aria-label="Chọn tệp Word" className="flex flex-col gap-3">
      <GradeSelect value={grade} onChange={setGrade} hint="Áp dụng cho mọi đề trong tệp. Đề khác lớp thì nạp riêng từng tệp." />
      <input ref={file} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" aria-label="Chọn tệp Word" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button onClick={() => file.current?.click()} disabled={!grade || running || !!busy}>{busy || "Chọn tệp Word (.docx)"}</Button>
        <p className="text-sm text-text-muted">Tệp có chữ hoặc ảnh chụp đề đều đọc được, mỗi tệp tối đa vài chục đề. Nhãn kiểu &ldquo;Bài 1&rdquo;, &ldquo;Bài A.03&rdquo; được bỏ qua.</p>
      </div>
      {prog && (
        <div aria-live="polite" className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="font-medium">{prog.label}: {prog.done}/{prog.total}</p>
          <progress className="h-3 w-full accent-primary" value={prog.done} max={prog.total} aria-label={prog.label} />
        </div>
      )}
      {errs.length > 0 && <Alert tone="danger">{errs.map((e) => `${e.name}: ${e.reason}`).join(" | ")}</Alert>}
    </section>
  );
}
