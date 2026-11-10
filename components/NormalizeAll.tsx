"use client";
import { useRef, useState } from "react";
import { AiButton, Button, post, toast } from "@/components/ui";
import { PAR } from "@/lib/batch";

type Fail = { name: string; reason: string };
type Reply = { made: number; failed: Fail[]; left: string[] };
type Run = { phase: "list" | "work" | "done"; done: number; total: number; fails: Fail[]; eta: string };

// Chuẩn hóa mọi đề chưa xóa (kể cả đề đã đạt chuẩn): cùng action "finish" với nút hàng loạt ở trang Đề bài.
// Gửi từng nhóm PAR đề (bằng số đề server làm song song) để thanh tiến độ nhích sau mỗi nhóm thay vì đứng yên cả phút.
export default function NormalizeAll() {
  const [run, setRun] = useState<Run | null>(null);
  const stop = useRef(false);

  async function go() {
    stop.current = false;
    setRun({ phase: "list", done: 0, total: 0, fails: [], eta: "" });
    const t = await post<{ ids: string[] }>("/api/problems", { action: "todo_all" });
    if (!t.ok) { setRun(null); return void toast("danger", t.data.error ?? "Có lỗi."); }
    const total = t.data.ids.length, fails: Fail[] = [], t0 = Date.now();
    if (!total) { setRun(null); return void toast("success", "Chưa có đề nào."); }
    let queue = t.data.ids, done = 0, hard = "";
    setRun({ phase: "work", done, total, fails, eta: "" });
    while (queue.length && !stop.current) {
      const { ok, data } = await post<Reply & { error?: string }>("/api/problems", { action: "finish", ids: queue.slice(0, PAR) });
      if (!ok) { hard = data.error ?? "Có lỗi."; break; }
      done += data.made; fails.push(...data.failed);
      queue = [...data.left, ...queue.slice(PAR)];
      const seen = done + fails.length, left = total - seen;
      const min = Math.max(1, Math.round(((Date.now() - t0) / seen) * left / 60000));
      setRun({ phase: "work", done, total, fails: [...fails], eta: left ? ` · còn khoảng ${min} phút` : "" });
      if (!data.made && !data.failed.length) break; // lượt không làm được đề nào: tránh lặp vô hạn
    }
    setRun({ phase: "done", done, total, fails: [...fails], eta: hard ? ` · dừng: ${hard}` : stop.current ? " · đã dừng" : "" });
    toast(fails.length || hard ? "warning" : "success", hard ? `Dừng: ${hard}` : `Đã chuẩn hóa ${done}/${total} đề${fails.length ? `, ${fails.length} đề lỗi` : ""}.`);
  }

  const running = !!run && run.phase !== "done";
  const seen = run ? run.done + run.fails.length : 0;
  return (
    <section aria-labelledby="norm-all" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 md:p-6">
      <h2 id="norm-all">Chuẩn hóa tất cả đề</h2>
      <p className="text-sm text-text-muted">AI chạy lại mọi đề chưa xóa, kể cả đề đã đạt chuẩn: sửa công thức hỏng, kiểm chéo đáp án, viết lại lời giải và chỉ dẫn từng bước. Mỗi đề mất khoảng 1 phút và tốn chi phí AI; dừng lúc nào cũng được, đề nào không đạt chuẩn thì giữ nguyên bản cũ. Đề đã khóa đáp án được giữ nguyên đáp án; AI có thể giải sai nên đáp án chưa khóa vẫn cần giáo viên tự kiểm tra và xác nhận ở trang đề.</p>
      <div className="flex flex-wrap items-center gap-2">
        <AiButton variant="secondary" onClick={go} disabled={running}>Chuẩn hóa tất cả đề</AiButton>
        {running && <Button variant="secondary" block={false} onClick={() => { stop.current = true; }}>Dừng sau nhóm này</Button>}
      </div>
      {run && (
        <div aria-live="polite" className="flex flex-col gap-2">
          <p className="font-medium">
            {run.phase === "list" ? "Đang lấy danh sách đề..." : `${seen}/${run.total}${run.fails.length ? ` · lỗi ${run.fails.length}` : ""}${run.eta}`}
            {run.phase === "work" && <span className="font-normal text-text-muted"> · AI đang làm {Math.min(PAR, run.total - seen)} đề tiếp theo, mỗi nhóm khoảng 1–2 phút</span>}
          </p>
          {/* Không có value = thanh chạy liên tục khi chưa xong đề nào, để biết trang không bị treo */}
          <progress className="h-3 w-full accent-primary" {...(run.phase === "list" || (run.phase === "work" && seen === 0) ? {} : { value: seen, max: run.total })} aria-label="Tiến độ chuẩn hóa" />
          {run.phase === "done" && run.fails.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{run.fails.map((f, k) => <li key={k}><strong>{f.name}</strong>: {f.reason}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}
