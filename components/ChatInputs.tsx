"use client";
import type { FormEvent, RefObject } from "react";
import { Button } from "@/components/ui";
import { MathText } from "@/components/MathText";
import FormulaButton from "@/components/FormulaButton";
import { looksLikeQuestion, looksLikeStepText } from "@/lib/chat/intent";

export type InputProps = {
  text: string; setText: (v: string) => void;
  busy: boolean; ready: boolean; // ready: phiên đã tạo xong, có sessionId
  onSend: (e: FormEvent) => void; onHint: () => void;
  progress: { done: number; total: number; next?: number; goal?: string; example?: string } | null;
  askOpen: boolean; setAskOpen: (v: boolean) => void; // khay "Hỏi bài" (tách hẳn khỏi ô nộp bước)
  askText: string; setAskText: (v: string) => void; onAsk: (e: FormEvent) => void;
  stuck: boolean; // sai liên tiếp, nhắc bấm Gợi ý
  box: RefObject<HTMLTextAreaElement | null>;
  compact?: boolean; // bàn phím ảo đang mở: bỏ đếm ký tự, xem trước, nhắc
};

const BOX = "min-h-11 flex-1 resize-y rounded-sm border bg-surface px-3 py-2 text-base max-sm:min-h-9 max-sm:py-1";
const SM = "max-sm:min-h-8! max-sm:px-2.5! max-sm:text-xs!";
const Preview = ({ text }: { text: string }) => text.includes("$") ? <div className="rounded-sm border border-border bg-primary-soft px-3 py-2 text-sm"><span className="block text-xs text-text-muted">Xem trước</span><MathText text={text} /></div> : null;

export const STEP_MAX = 500; // khớp giới hạn của route /api/chat
const ASK_MAX = 200;

// Nhắc nhẹ khi gõ nhầm ô: vẫn cho gửi, chỉ gợi ý chuyển (nội dung đã gõ được giữ nguyên).
const Nudge = ({ children, label, onClick }: { children: string; label: string; onClick: () => void }) => (
  <p className="flex flex-wrap items-center gap-2 rounded-sm bg-warning-soft px-3 py-1 text-xs sm:text-sm" role="status">
    <span>{children}</span>
    <button type="button" onClick={onClick} className="font-semibold text-primary underline">{label}</button>
  </p>
);

// Ô nộp bước giải: luôn chỉ để nộp bước (viền xanh). "Em chưa hiểu" mở khay Hỏi bài riêng (viền vàng, ô gõ riêng) nên không thể gõ câu hỏi vào ô nộp bước.
// Gợi ý lấy từ đề, không gọi AI; câu hỏi có giới hạn lượt ở server.
export function StepInput({ text, setText, busy, ready, onSend, onHint, progress, askOpen, setAskOpen, askText, setAskText, onAsk, stuck, box, compact }: InputProps) {
  const n = progress ? Math.min(progress.next ?? progress.done + 1, progress.total) : 1;
  const toAsk = () => { setAskText(text.trim().slice(0, ASK_MAX)); setText(""); setAskOpen(true); };
  const toStep = () => { setText(askText.trim().slice(0, STEP_MAX)); setAskText(""); setAskOpen(false); };
  return (
    <div className="flex flex-col gap-1 sm:gap-2">
      {progress && (
        <div className={`mt-1 rounded-sm border border-border border-l-4 border-l-primary bg-primary-soft px-3 py-1 text-xs sm:py-2 sm:text-sm ${compact ? "max-h-14 overflow-y-auto" : ""}`} aria-live="polite">
          <span className="font-semibold">Bước {n}/{progress.total}</span>{progress.goal && <>: <MathText text={progress.goal} /></>}
        </div>
      )}
      {askOpen && (
        <form onSubmit={onAsk} aria-label="Hỏi bài" className="flex flex-col gap-1 rounded-sm border-2 border-warning bg-warning-soft p-2">
          <label htmlFor="ask" className="text-xs font-semibold sm:text-sm">❓ Hỏi bài: bạn chưa hiểu chỗ nào?</label>
          <div className="flex items-end gap-2">
            <textarea id="ask" rows={1} autoFocus value={askText} onChange={(e) => setAskText(e.target.value)} disabled={busy || !ready} maxLength={ASK_MAX} placeholder="Ví dụ: Đề hỏi gì vậy?" className={`${BOX} border-warning`} />
            <Button type="submit" block={false} className={SM} disabled={!askText.trim() || !ready} pending={busy ? "Đang gửi..." : undefined}>Gửi câu hỏi</Button>
          </div>
          {looksLikeStepText(askText) && <Nudge label="Chuyển sang Nộp bước" onClick={toStep}>Đây giống một bước giải hơn là câu hỏi.</Nudge>}
          <button type="button" onClick={() => { setAskOpen(false); setAskText(""); }} className="self-start text-xs text-text-muted underline">Đóng, quay lại nộp bước</button>
        </form>
      )}
      <form onSubmit={onSend} className="flex flex-col gap-1 sm:gap-2">
        <label htmlFor="step" className={`text-xs font-medium sm:text-sm ${compact ? "sr-only" : ""}`}>✏️ Viết bước giải của bạn</label>
        <div className="flex items-end gap-2">
          <textarea id="step" ref={box} rows={1} value={text} onChange={(e) => setText(e.target.value)} disabled={busy || !ready} maxLength={STEP_MAX} placeholder={!ready ? "Đang mở bài, chờ một chút..." : progress?.example ? `Ví dụ: ${progress.example}` : "Viết bước giải của bạn ở đây"} className={`${BOX} border-primary`} />
          <Button type="submit" block={false} className={SM} disabled={!text.trim() || !ready} pending={busy ? (ready ? "Đang kiểm tra..." : "Đang mở bài...") : undefined}>Nộp bước</Button>
        </div>
        {looksLikeQuestion(text) && !compact && <Nudge label="Mở Hỏi bài" onClick={toAsk}>Có vẻ bạn đang hỏi, không phải nộp bước.</Nudge>}
        {text.length >= STEP_MAX - 50 && <p className="text-right text-xs tnum text-danger" aria-live="off">{text.length}/{STEP_MAX}</p>}
        {!compact && <Preview text={text} />}
        {stuck && !askOpen && !compact && <p className="text-sm text-primary" role="status">Chưa ra? Bấm Gợi ý hoặc Em chưa hiểu nhé.</p>}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <FormulaButton target={box} value={text} onChange={setText} disabled={busy || !ready} />
          <Button variant="secondary" type="button" onClick={onHint} disabled={busy || !ready} className={`text-sm ${SM}`}>Gợi ý</Button>
          <Button variant="secondary" type="button" onClick={() => setAskOpen(!askOpen)} disabled={busy || !ready} aria-expanded={askOpen} className={`text-sm ${SM}`}>Em chưa hiểu</Button>
        </div>
      </form>
    </div>
  );
}
