"use client";
import { useRef, useState } from "react";
import { AiButton, Button, post, toast } from "@/components/ui";
import { PAR } from "@/lib/batch";

type Fail = { name: string; reason: string };
type Reply = { checked: number; flagged: Fail[]; failed: Fail[]; left: string[] };
type Run = { phase: "list" | "work" | "done"; total: number; seen: number; flagged: Fail[]; failed: number; note: string };

// Kiểm đáp án và lời giải bằng AI, không viết lại đề. Đề có vấn đề được gắn cảnh báo (hiện ở trang Đề bài) để bấm "Chuẩn hóa" làm lại.
export default function AuditAll() {
  const [run, setRun] = useState<Run | null>(null);
  const stop = useRef(false);

  async function go() {
    stop.current = false;
    setRun({ phase: "list", total: 0, seen: 0, flagged: [], failed: 0, note: "" });
    const t = await post<{ ids: string[] }>("/api/problems", { action: "todo_all" });
    if (!t.ok) { setRun(null); return void toast("danger", t.data.error ?? "Có lỗi."); }
    const total = t.data.ids.length, flagged: Fail[] = [];
    if (!total) { setRun(null); return void toast("success", "Chưa có đề nào."); }
    let queue = t.data.ids, seen = 0, failed = 0, hard = "";
    setRun({ phase: "work", total, seen, flagged, failed, note: "" });
    while (queue.length && !stop.current) {
      const { ok, data } = await post<Reply & { error?: string }>("/api/problems", { action: "audit", ids: queue.slice(0, PAR) });
      if (!ok) { hard = data.error ?? "Có lỗi."; break; }
      seen += data.checked + data.failed.length;
      failed += data.failed.length;
      flagged.push(...data.flagged);
      queue = [...data.left, ...queue.slice(PAR)];
      setRun({ phase: "work", total, seen, flagged: [...flagged], failed, note: "" });
      if (!data.checked && !data.failed.length) break; // lượt không làm được đề nào: tránh lặp vô hạn
    }
    const note = hard ? ` · dừng: ${hard}` : stop.current ? " · đã dừng" : "";
    setRun({ phase: "done", total, seen, flagged: [...flagged], failed, note });
    toast(flagged.length || failed || hard ? "warning" : "success", hard ? `Dừng: ${hard}` : `Đã kiểm ${seen}/${total} đề: ${flagged.length} đề có vấn đề${failed ? `, ${failed} đề AI chưa trả lời được` : ""}.`);
  }

  const running = !!run && run.phase !== "done";
  return (
    <details aria-labelledby="audit-all" className="group rounded-lg border border-border bg-surface p-4 md:p-6">
      <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-1.5 size-5 shrink-0 text-text-muted transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4l6 6-6 6" /></svg>
        <span className="flex min-w-0 flex-col gap-1">
          <h2 id="audit-all" className="inline">Kiểm tra đề</h2>
          <span className="text-sm font-normal text-text-muted">AI kiểm đáp án và lời giải, gắn cảnh báo cho đề có vấn đề.</span>
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
      <p className="text-sm text-text-muted">AI giải lại đáp án (bỏ qua đề đã khóa đáp án) và rà từng phép tính trong lời giải của mọi đề chưa xóa, kể cả đề đã duyệt. Không sửa nội dung đề. Đề có vấn đề được gắn cảnh báo &quot;Cần xem lại&quot; ở trang Đề bài; sau đó bấm &quot;Chuẩn hóa tất cả đề&quot; để làm lại các đề đó. Tốn chi phí AI, ít hơn chuẩn hóa.</p>
      <div className="flex flex-wrap items-center gap-2">
        <AiButton variant="secondary" onClick={go} disabled={running}>Kiểm tra tất cả đề</AiButton>
        {running && <Button variant="secondary" block={false} onClick={() => { stop.current = true; }}>Dừng sau nhóm này</Button>}
      </div>
      {run && (
        <div aria-live="polite" className="flex flex-col gap-2">
          <p className="font-medium">
            {run.phase === "list" ? "Đang lấy danh sách đề..." : `${run.seen}/${run.total} · có vấn đề ${run.flagged.length}${run.failed ? ` · AI chưa trả lời ${run.failed}` : ""}${run.note}`}
          </p>
          <progress className="h-3 w-full accent-primary" {...(run.phase === "list" || (run.phase === "work" && run.seen === 0) ? {} : { value: run.seen, max: run.total })} aria-label="Tiến độ kiểm tra" />
          {run.flagged.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{run.flagged.map((f, k) => <li key={k}><strong>{f.name}</strong>: {f.reason}</li>)}</ul>}
          {run.phase === "done" && !run.flagged.length && !run.failed && <p className="text-sm text-text-muted">Không thấy vấn đề.</p>}
        </div>
      )}
      </div>
    </details>
  );
}
