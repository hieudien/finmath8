"use client";
import type { FormEvent, RefObject } from "react";
import { Button } from "@/components/ui";
import { MathText } from "@/components/MathText";
import FormulaButton from "@/components/FormulaButton";

export type InputProps = {
  text: string; setText: (v: string) => void;
  busy: boolean; ready: boolean; // ready: phiên đã tạo xong, có sessionId
  onSend: (e: FormEvent) => void; onHint: () => void;
  progress: { done: number; total: number; next?: number; goal?: string; example?: string } | null;
  asking: boolean; setAsking: (v: boolean) => void; // đang gõ câu hỏi "Em chưa hiểu"
  stuck: boolean; // sai liên tiếp, nhắc bấm Gợi ý
  box: RefObject<HTMLTextAreaElement | null>;
  compact?: boolean; // bàn phím ảo đang mở: bỏ đếm ký tự, xem trước, nhắc
};

const BOX = "min-h-11 flex-1 resize-y rounded-sm border border-border-strong bg-surface px-3 py-2 text-base max-sm:min-h-9 max-sm:py-1";
const SM = "max-sm:min-h-8! max-sm:px-2.5! max-sm:text-xs!";
const Preview = ({ text }: { text: string }) => text.includes("$") ? <div className="rounded-sm border border-border bg-primary-soft px-3 py-2 text-sm"><span className="block text-xs text-text-muted">Xem trước</span><MathText text={text} /></div> : null;

const STEP_MAX = 150;

// Ô nhập một bước giải: ngắn, một việc mỗi lần. Gợi ý lấy từ đề, không gọi AI. "Em chưa hiểu" chuyển ô thành câu hỏi (có giới hạn lượt ở server).
export function StepInput({ text, setText, busy, ready, onSend, onHint, progress, asking, setAsking, stuck, box, compact }: InputProps) {
  const n = progress ? Math.min(progress.next ?? progress.done + 1, progress.total) : 1;
  const label = asking ? "Bạn chưa hiểu chỗ nào?" : "Viết bước giải của bạn";
  return (
    <form onSubmit={onSend} className="flex flex-col gap-1 sm:gap-2">
      {progress && (
        <div className={`rounded-sm border border-border border-l-4 border-l-primary bg-primary-soft mt-1 px-3 py-1 text-xs sm:py-2 sm:text-sm ${compact ? "max-h-14 overflow-y-auto" : ""}`} aria-live="polite">
          <span className="font-semibold">Bước {n}/{progress.total}</span>{progress.goal && <>: <MathText text={progress.goal} /></>}
        </div>
      )}
      <label htmlFor="step" className={`text-xs font-medium sm:text-sm ${compact ? "sr-only" : ""}`}>{label}</label>
      <div className="flex items-end gap-2">
        <textarea id="step" ref={box} rows={1} value={text} onChange={(e) => setText(e.target.value)} disabled={busy || !ready} maxLength={STEP_MAX} placeholder={!ready ? "Đang mở bài, chờ một chút..." : asking ? "Ví dụ: Đề hỏi gì vậy?" : progress?.example ? `Ví dụ: ${progress.example}` : "Viết bước giải của bạn ở đây"} className={BOX} />
        <Button type="submit" block={false} className={SM} disabled={!text.trim() || !ready} pending={busy ? (ready ? "Đang kiểm tra..." : "Đang mở bài...") : undefined}>{asking ? "Gửi câu hỏi" : "Nộp bước"}</Button>
      </div>
      {(!compact || text.length >= STEP_MAX - 20) && <p className={`text-right text-xs tnum ${text.length >= STEP_MAX - 20 ? "text-danger" : "text-text-muted"}`} aria-live="off">{text.length}/{STEP_MAX}</p>}
      {!compact && <Preview text={text} />}
      {stuck && !asking && !compact && <p className="text-sm text-primary" role="status">Chưa ra? Bấm Gợi ý hoặc Em chưa hiểu nhé.</p>}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <FormulaButton target={box} value={text} onChange={setText} disabled={busy || !ready} />
        <Button variant="secondary" type="button" onClick={onHint} disabled={busy || !ready} className={`text-sm ${SM}`}>Gợi ý</Button>
        <Button variant={asking ? "primary" : "secondary"} type="button" onClick={() => setAsking(!asking)} disabled={busy || !ready} aria-pressed={asking} className={`text-sm ${SM}`}>{asking ? "Quay lại nộp bước" : "Em chưa hiểu"}</Button>
      </div>
    </form>
  );
}
