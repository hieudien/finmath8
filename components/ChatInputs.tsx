"use client";
import type { FormEvent, RefObject } from "react";
import { Button } from "@/components/ui";
import { MathText } from "@/components/MathText";
import FormulaButton from "@/components/FormulaButton";

export type InputProps = {
  text: string; setText: (v: string) => void;
  busy: boolean; ready: boolean; // ready: phiên đã tạo xong, có sessionId
  onSend: (e: FormEvent) => void; onHint: () => void;
  progress: { done: number; total: number; next?: number; goal?: string } | null;
  asking: boolean; setAsking: (v: boolean) => void; // đang gõ câu hỏi "Em chưa hiểu"
  stuck: boolean; // sai liên tiếp, nhắc bấm Gợi ý
  box: RefObject<HTMLTextAreaElement | null>;
};

const BOX = "min-h-11 flex-1 resize-y rounded-sm border border-border-strong bg-surface px-3 py-2 text-base";
const NOTE = <p className="text-xs text-text-muted">MathStep AI · Giáo viên xem được bài làm của bạn. Đừng gõ số điện thoại hay email.</p>;
const Preview = ({ text }: { text: string }) => text.includes("$") ? <div className="rounded-sm border border-border bg-primary-soft px-3 py-2 text-sm"><span className="block text-xs text-text-muted">Xem trước</span><MathText text={text} /></div> : null;

const STEP_MAX = 150;

// Ô nhập một bước giải: ngắn, một việc mỗi lần. Gợi ý lấy từ đề, không gọi AI. "Em chưa hiểu" chuyển ô thành câu hỏi (có giới hạn lượt ở server).
export function StepInput({ text, setText, busy, ready, onSend, onHint, progress, asking, setAsking, stuck, box }: InputProps) {
  const n = progress ? Math.min(progress.next ?? progress.done + 1, progress.total) : 1;
  const label = asking ? "Bạn chưa hiểu chỗ nào?" : "Viết bước giải của bạn";
  return (
    <form onSubmit={onSend} className="flex flex-col gap-2">
      {progress && (
        <div className="rounded-sm border border-border border-l-4 border-l-primary bg-primary-soft px-3 py-2 text-sm" aria-live="polite">
          <span className="font-semibold">Bước {n}/{progress.total}</span>{progress.goal && <>: <MathText text={progress.goal} /></>}
        </div>
      )}
      <label htmlFor="step" className="text-sm font-medium">{label}</label>
      <div className="flex items-end gap-2">
        <textarea id="step" ref={box} rows={2} value={text} onChange={(e) => setText(e.target.value)} disabled={busy || !ready} maxLength={STEP_MAX} placeholder={!ready ? "Đang mở bài, chờ một chút..." : asking ? "Ví dụ: Đề hỏi gì vậy?" : "Ví dụ: 2x = 14 - 6"} className={BOX} />
        <Button type="submit" block={false} disabled={!text.trim() || !ready} pending={busy ? (ready ? "Đang kiểm tra..." : "Đang mở bài...") : undefined}>{asking ? "Gửi câu hỏi" : "Nộp bước"}</Button>
      </div>
      <p className={`text-right text-xs tnum ${text.length >= STEP_MAX - 20 ? "text-danger" : "text-text-muted"}`} aria-live="off">{text.length}/{STEP_MAX}</p>
      <Preview text={text} />
      {stuck && !asking && <p className="text-sm text-primary" role="status">Chưa ra? Bấm Gợi ý hoặc Em chưa hiểu nhé.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <FormulaButton target={box} value={text} onChange={setText} disabled={busy || !ready} />
        <Button variant="secondary" type="button" onClick={onHint} disabled={busy || !ready} className="text-sm">Gợi ý</Button>
        <Button variant={asking ? "primary" : "secondary"} type="button" onClick={() => setAsking(!asking)} disabled={busy || !ready} aria-pressed={asking} className="text-sm">{asking ? "Quay lại nộp bước" : "Em chưa hiểu"}</Button>
      </div>
      {NOTE}
    </form>
  );
}
