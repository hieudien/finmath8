"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AiButton, Button, Confirm, GradeSelect, TextArea, post, toast, useRefresh } from "@/components/ui";
import { CHUNK, PAR, splitProblems } from "@/lib/batch";

type Fail = { name: string; reason: string; i?: number };
type Reply<T> = { made: number; failed: Fail[]; left: T[] };
type Run = { label: string; done: number; total: number; fails: Fail[]; eta: string; over: boolean };

// Ước lượng thô để giáo viên biết trước: mỗi đề khoảng 20s chuẩn hóa + 35s hoàn thiện, làm song song PAR đề.
const minutes = (n: number, sec: number) => Math.max(1, Math.round((n * sec) / PAR / 60));
const when = (m: number) => (m >= 90 ? `${(m / 60).toFixed(1).replace(".", ",")} giờ` : `${m} phút`);

export function ImportPanel({ todo }: { todo: number }) {
  const [rp, refresh] = useRefresh();
  const [tab, setTab] = useState<"json" | "text">("text");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const stop = useRef(false);
  const file = useRef<HTMLInputElement>(null);

  const running = !!run && !run.over;
  const wait = busy || (rp ? "Đang cập nhật danh sách..." : "");
  const texts = useMemo(() => (tab === "text" ? splitProblems(raw) : []), [tab, raw]);
  const fail = (t?: string) => toast("danger", t ?? "Có lỗi.");

  // Gửi từng lượt tối đa CHUNK phần tử; phần server chưa kịp làm (left) quay lại đầu hàng. Lỗi cứng (hết key, mất mạng) thì dừng hẳn.
  async function drain<T>(label: string, items: T[], call: (chunk: T[]) => Promise<Reply<T> | string>) {
    const total = items.length, t0 = Date.now(), fails: Fail[] = [];
    let queue = items, done = 0, hard = "";
    stop.current = false;
    setRun({ label, done: 0, total, fails, eta: "", over: false });
    while (queue.length && !stop.current) {
      const chunk = queue.slice(0, CHUNK);
      const r = await call(chunk);
      if (typeof r === "string") { hard = r; break; }
      done += r.made; fails.push(...r.failed);
      queue = [...r.left, ...queue.slice(CHUNK)];
      const seen = done + fails.length, left = total - seen;
      setRun({ label, done, total, fails: [...fails], eta: seen && left ? ` · còn khoảng ${when(Math.max(1, Math.round(((Date.now() - t0) / seen) * left / 60000)))}` : "", over: false });
      if (!r.made && !r.failed.length) break; // lượt không làm được đề nào: tránh lặp vô hạn
    }
    setRun((x) => x && { ...x, over: true, eta: hard ? ` · dừng: ${hard}` : stop.current ? " · đã dừng" : "" });
    return { done, fails, hard };
  }

  const finishCall = async (ids: string[]): Promise<Reply<string> | string> => {
    const { ok, data } = await post<Reply<string> & { left: string[] }>("/api/problems", { action: "finish", ids });
    return ok ? data : data.error ?? "Có lỗi.";
  };

  async function finishAll() {
    const { ok, data } = await post<{ ids: string[] }>("/api/problems", { action: "todo" });
    if (!ok) return fail(data.error);
    if (!data.ids.length) { toast("success", "Mọi đề đã đạt chuẩn."); return refresh(); }
    const r = await drain("Chuẩn hóa đề", data.ids, finishCall);
    toast(r.fails.length || r.hard ? "warning" : "success", `Đã chuẩn hóa ${r.done}/${data.ids.length} đề${r.fails.length ? `, ${r.fails.length} đề lỗi (xem danh sách, bấm lại để thử tiếp)` : ""}.`);
    refresh();
  }

  // Đề thô: 1) AI đọc từng đề thành đề nháp lưu vào DB, 2) chuẩn hóa mọi đề còn việc (gồm cả đề nháp của lần chạy trước bị dừng).
  async function fromText() {
    const retry: string[] = [];
    const a = await drain("Đọc đề từ văn bản", texts, async (chunk): Promise<Reply<string> | string> => {
      const { ok, data } = await post<{ made: number; failed: Fail[]; left: number[] }>("/api/problems", { action: "normalize_batch", texts: chunk, grade: Number(grade) });
      if (!ok) return data.error ?? "Có lỗi.";
      data.failed.forEach((f) => { if (f.i !== undefined) retry.push(chunk[f.i]); });
      return { made: data.made, failed: data.failed, left: data.left.map((i) => chunk[i]) };
    });
    refresh();
    if (a.hard || stop.current) return;
    const { ok, data } = await post<{ ids: string[] }>("/api/problems", { action: "todo" });
    if (!ok) return fail(data.error);
    const b = await drain("Chuẩn hóa đề", data.ids, finishCall);
    setRaw(retry.join("\n\n\n")); // đề chuẩn hóa lỗi: để lại trong ô để bấm tạo lại
    toast(a.fails.length || b.fails.length || b.hard ? "warning" : "success", `Đã tạo ${a.done} đề, chuẩn hóa ${b.done}/${data.ids.length}${a.fails.length + b.fails.length ? `, ${a.fails.length + b.fails.length} đề lỗi` : ""}.`);
    setRun((x) => x && { ...x, fails: [...a.fails, ...b.fails] });
    refresh();
  }

  async function saveJson() {
    setBusy("Đang lưu...");
    const { ok, data } = await post<{ saved: number }>("/api/problems", { action: "import_json", raw });
    setBusy("");
    if (!ok) return fail(data.error);
    toast("success", `Đã lưu ${data.saved} đề. Bấm "Chuẩn hóa" để hoàn thiện.`); setRaw(""); setOpen(false); refresh();
  }
  async function seed() {
    setBusy("Đang thêm...");
    const { ok, data } = await post<{ saved: number }>("/api/problems", { action: "seed" });
    setBusy("");
    if (!ok) return fail(data.error);
    toast("success", `Đã lưu ${data.saved} đề.`); setOpen(false); refresh();
  }

  const tabCls = (t: string) => `min-h-11 flex-1 border-b-2 px-3 font-medium ${tab === t ? "border-primary text-primary" : "border-transparent text-text-muted"}`;
  const panel = run && (
    <section aria-label="Tiến độ" aria-live="polite" className="flex w-full flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <p className="font-medium">{run.label}: {run.done + run.fails.length}/{run.total}{run.fails.length ? ` · lỗi ${run.fails.length}` : ""}{run.eta}</p>
      <progress className="h-3 w-full accent-primary" value={run.done + run.fails.length} max={run.total} aria-label={run.label} />
      {run.over && run.fails.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm">{run.fails.map((f, k) => <li key={k}><strong>{f.name}</strong>: {f.reason}</li>)}</ul>
      )}
      <div>{run.over ? <Button variant="secondary" block={false} onClick={() => setRun(null)}>Đóng</Button> : <Button variant="secondary" block={false} onClick={() => { stop.current = true; }}>Dừng sau lượt này</Button>}</div>
    </section>
  );

  if (!open) return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/problems/new" className="inline-flex min-h-11 items-center justify-center rounded-sm bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover">Tạo đề mới</Link>
        <Button variant="secondary" disabled={running} onClick={() => setOpen(true)}>Nạp JSON / dán văn bản</Button>
        <AiButton variant="secondary" onClick={finishAll} disabled={running || todo === 0} pending={rp ? "Đang cập nhật danh sách..." : undefined}>
          {todo ? `Chuẩn hóa ${todo} đề chưa đạt chuẩn` : "Mọi đề đã đạt chuẩn"}
        </AiButton>
      </div>
      {todo > 0 && !running && <p className="text-sm text-text-muted">AI làm đến khi đề đạt chuẩn: sửa công thức hỏng, kiểm chéo đáp án, viết lời giải và chỉ dẫn từng bước. Ước tính khoảng {when(minutes(todo, 35))}; chạy theo lượt {CHUNK} đề, dừng lúc nào cũng được và làm tiếp sau.</p>}
      {panel}
    </div>
  );

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 md:p-6" aria-labelledby="imp">
      <div className="flex items-center justify-between gap-2">
        <h2 id="imp">Thêm đề mới</h2>
        <Button variant="ghost" onClick={() => setOpen(false)}>Đóng</Button>
      </div>
      <div role="tablist" className="flex border-b border-border">
        <button role="tab" aria-selected={tab === "text"} className={tabCls("text")} onClick={() => setTab("text")}>Văn bản (nhiều đề)</button>
        <button role="tab" aria-selected={tab === "json"} className={tabCls("json")} onClick={() => setTab("json")}>JSON</button>
      </div>

      <TextArea label={tab === "json" ? "Nội dung JSON (một đề hoặc mảng nhiều đề)" : "Dán đề bài dạng văn bản"} rows={8} value={raw} onChange={(e) => setRaw(e.target.value)} disabled={running}
        hint={tab === "json" ? "Cần: id, title, statement (đề bài hiển thị cho học sinh), solution, hints (3 mức). Chuẩn hóa sẽ tạo lại dữ kiện, đáp án và lời giải từ statement." : "Dán một hoặc nhiều đề. Mỗi đề bắt đầu bằng \"Bài 1\", \"Câu 2\"... hoặc cách nhau 2 dòng trống. AI chuẩn hóa, giải, kiểm chéo đáp án và viết chỉ dẫn; đề đạt chuẩn là dùng được luôn."} />
      {tab === "text" && <GradeSelect value={grade} onChange={setGrade} hint="Áp dụng cho mọi đề trong ô trên. Đề khác lớp thì nạp riêng từng lớp." />}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {tab === "json" ? (
          <>
            <Button onClick={saveJson} disabled={raw.trim().length < 2} pending={wait || undefined}>Kiểm tra và lưu</Button>
            <input ref={file} type="file" accept=".json,application/json" className="sr-only" aria-label="Chọn tệp JSON" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setRaw(await f.text()); }} />
            <Button variant="secondary" onClick={() => file.current?.click()}>Chọn tệp .json</Button>
          </>
        ) : (
          <>
            <AiButton onClick={fromText} disabled={!texts.length || !grade || running}>{texts.length > 1 ? `Tạo ${texts.length} đề bằng AI` : "Tạo đề bằng AI"}</AiButton>
            {texts.length > 0 && <p className="text-sm text-text-muted">Tách được {texts.length} đề, ước tính khoảng {when(minutes(texts.length, 55))}.</p>}
          </>
        )}
      </div>
      {panel}
      <div className="border-t border-border pt-4">
        <p className="mb-2 text-sm text-text-muted">Tài khoản mới đã có sẵn 10 đề mẫu (TC01–TC10). Lỡ xóa nhầm thì bấm đây để thêm lại, đề đã có sẽ được giữ nguyên.</p>
        <Button variant="secondary" onClick={seed} pending={wait || undefined}>Thêm đề mẫu</Button>
      </div>
    </section>
  );
}

export function ProblemActions({ id }: { id: string }) {
  return (
    <div className="ml-auto flex flex-wrap items-center gap-2">
      <Link href={`/dashboard/problems/${id}`} className="inline-flex min-h-11 items-center justify-center rounded-sm bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover">Xem đề</Link>
      <Link href={`/dashboard/problems/${id}/edit`} className="inline-flex min-h-11 items-center justify-center rounded-sm border border-border-strong bg-surface px-4 font-medium hover:bg-primary-soft">Sửa</Link>
      <Confirm label="Xóa" message="Đề sẽ bị xóa khỏi danh sách. Liên kết đã tạo vẫn dùng bản chụp đề cũ." onConfirm={async () => { const { ok, data } = await post("/api/problems", { action: "delete", id }); if (!ok) return data.error ?? "Có lỗi."; }} />
    </div>
  );
}
