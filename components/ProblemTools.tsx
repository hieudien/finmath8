"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { AiButton, Button, Confirm, post, toast, useRefresh } from "@/components/ui";
import { CHUNK, PAR } from "@/lib/batch";

type Fail = { name: string; reason: string; i?: number };
type Reply<T> = { made: number; failed: Fail[]; left: T[] };
type Run = { label: string; done: number; total: number; fails: Fail[]; eta: string; over: boolean };

// Ước lượng thô để giáo viên biết trước: mỗi đề khoảng 20s chuẩn hóa + 35s hoàn thiện, làm song song PAR đề.
const minutes = (n: number, sec: number) => Math.max(1, Math.round((n * sec) / PAR / 60));
const when = (m: number) => (m >= 90 ? `${(m / 60).toFixed(1).replace(".", ",")} giờ` : `${m} phút`);

export function ImportPanel({ todo }: { todo: number }) {
  const [rp, refresh] = useRefresh();
  const [busy, setBusy] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const stop = useRef(false);

  const running = !!run && !run.over;
  const wait = busy || (rp ? "Đang cập nhật danh sách..." : "");
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

  async function seed() {
    setBusy("Đang thêm...");
    const { ok, data } = await post<{ saved: number }>("/api/problems", { action: "seed" });
    setBusy("");
    if (!ok) return fail(data.error);
    toast("success", `Đã lưu ${data.saved} đề.`); refresh();
  }

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

  return (
    <div className="flex w-full flex-col items-start gap-3">
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/problems/new" className="inline-flex min-h-11 items-center justify-center rounded-sm bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover">Tạo đề mới</Link>
        <AiButton variant="secondary" onClick={finishAll} disabled={running || todo === 0} pending={rp ? "Đang cập nhật danh sách..." : undefined}>
          {todo ? `Chuẩn hóa ${todo} đề chưa đạt chuẩn` : "Mọi đề đã đạt chuẩn"}
        </AiButton>
        <Button variant="ghost" onClick={seed} disabled={running} pending={wait || undefined}>Thêm đề mẫu</Button>
      </div>
      {todo > 0 && !running && <p className="text-sm text-text-muted">AI làm đến khi đề đạt chuẩn: sửa công thức hỏng, kiểm chéo đáp án, viết lời giải và chỉ dẫn từng bước. Ước tính khoảng {when(minutes(todo, 35))}; chạy theo lượt {CHUNK} đề, dừng lúc nào cũng được và làm tiếp sau.</p>}
      {panel}
    </div>
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
