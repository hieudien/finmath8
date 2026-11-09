"use client";
import { useState, type ComponentType, type FormEvent, type RefObject } from "react";
import { Button } from "@/components/ui";
import { MathText } from "@/components/MathText";
import FormulaButton from "@/components/FormulaButton";
import type { Mode } from "@/lib/modes";

export type InputProps = {
  text: string; setText: (v: string) => void;
  busy: boolean; ready: boolean; // ready: phiên đã tạo xong, có sessionId
  onSend: (e: FormEvent) => void; onFinish: () => void; onHint: () => void; onPick: (choice: string) => void; tried: string[];
  canFinish: boolean;
  progress: { done: number; total: number; next?: number; goal?: string; options?: string[] } | null;
  asking: boolean; setAsking: (v: boolean) => void; // kiểu từng bước: đang gõ câu hỏi "Em chưa hiểu"
  stuck: boolean; // kiểu từng bước: sai liên tiếp, nhắc bấm Gợi ý
  box: RefObject<HTMLTextAreaElement | null>;
};

const BOX = "min-h-11 flex-1 resize-y rounded-sm border border-border-strong bg-surface px-3 py-2 text-base";
const NOTE = <p className="text-xs text-text-muted">MathStep AI · Giáo viên xem được bài làm của bạn. Đừng gõ số điện thoại hay email.</p>;
const Preview = ({ text }: { text: string }) => text.includes("$") ? <div className="rounded-sm border border-border bg-primary-soft px-3 py-2 text-sm"><span className="block text-xs text-text-muted">Xem trước</span><MathText text={text} /></div> : null;

function ChatInput({ text, setText, busy, ready, onSend, onFinish, canFinish, box }: InputProps) {
  return (
    <form onSubmit={onSend} className="flex flex-col gap-2">
      <label htmlFor="msg" className="sr-only">Câu trả lời của em</label>
      <div className="flex items-end gap-2">
        <textarea id="msg" ref={box} rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={busy || !ready} maxLength={500} placeholder={ready ? "Nhập câu trả lời của bạn. Enter để xuống dòng, bấm Gửi để gửi." : "Đang mở bài, chờ một chút..."} className={BOX} />
        <Button type="submit" block={false} disabled={!text.trim() || !ready} pending={busy ? (ready ? "Đang gửi..." : "Đang mở bài...") : undefined}>Gửi</Button>
      </div>
      <p className={`text-right text-xs tnum ${text.length >= 450 ? "text-danger" : "text-text-muted"}`} aria-live="off">{text.length}/500</p>
      <Preview text={text} />
      <div className="flex flex-wrap items-center gap-2">
        <FormulaButton target={box} value={text} onChange={setText} disabled={busy || !ready} />
        <Button variant="ghost" type="button" onClick={onFinish} disabled={busy || !ready || !canFinish} className="text-sm">Kết thúc bài</Button>
      </div>
      {NOTE}
    </form>
  );
}

const STEP_MAX = 150;

// Ô nhập một bước giải: ngắn, một việc mỗi lần. Gợi ý lấy từ đề, không gọi AI. "Em chưa hiểu" chuyển ô thành câu hỏi (có giới hạn lượt ở server).
function StepInput({ text, setText, busy, ready, onSend, onHint, progress, asking, setAsking, stuck, box }: InputProps) {
  const n = progress ? Math.min(progress.next ?? progress.done + 1, progress.total) : 1;
  const label = asking ? "Bạn chưa hiểu chỗ nào? Hỏi ngắn thôi" : "Viết bước giải của bạn";
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

// AI viết đáp án không có $...$ (ví dụ "x + y = 5 và x - y = 1") nên MathText hiện nguyên mã. Đáp án không có $: từ tiếng Việt giữ làm chữ, phần còn lại bọc $...$ từng đoạn.
// ponytail: đoán theo dấu tiếng Việt; chữ không dấu ("cm", "kg") thành công thức. Nâng cấp: bắt AI luôn viết $...$ trong đáp án.
const WORD = /\p{L}*[^\x00-\x7F\P{L}]\p{L}*/gu; // từ tiếng Việt: có ít nhất một chữ cái có dấu (và, đồng, tính...). Chữ ASCII (x, my, cm, sin) coi là công thức.
const asMath = (raw: string) => {
  const o = raw.normalize("NFC");
  if (o.includes("$")) return o;
  let out = "", last = 0;
  const math = (s: string) => s.trim() ? s.replace(/^(\s*)([\s\S]*?)(\s*)$/, "$1$$$2$$$3") : s;
  for (const m of o.matchAll(WORD)) { out += math(o.slice(last, m.index)) + m[0]; last = m.index + m[0].length; }
  return out + math(o.slice(last));
};

// Trắc nghiệm: chọn một trong 4 đáp án rồi bấm Trả lời (tránh bấm nhầm). Đáp án đã chọn sai bị mờ đi. Gợi ý lấy từ đề, không gọi AI.
function QuizInput({ busy, ready, onHint, onPick, progress, tried }: InputProps) {
  const [sel, setSel] = useState("");
  const n = progress ? Math.min(progress.next ?? progress.done + 1, progress.total) : 1;
  const opts = progress?.options ?? [];
  const cur = opts.includes(sel) && !tried.includes(sel) ? sel : "";
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (cur) { onPick(cur); setSel(""); } }} className="flex flex-col gap-2">
      {progress && (
        <div className="max-h-[18dvh] overflow-y-auto rounded-sm border border-border border-l-4 border-l-primary bg-primary-soft px-3 py-1 text-xs" aria-live="polite">
          <span className="font-semibold">Bước {n}/{progress.total}</span>{progress.goal && <>: <MathText text={progress.goal} /></>}
        </div>
      )}
      <fieldset className="grid max-h-[32dvh] grid-cols-2 gap-2 overflow-y-auto" disabled={busy || !ready}>
        <legend className="sr-only">Tự tính rồi chọn đáp án đúng</legend>
        {opts.map((o, i) => (
          <label key={o} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary ${tried.includes(o) ? "cursor-not-allowed opacity-50" : cur === o ? "border-primary bg-primary-soft" : "border-border-strong bg-surface"}`}>
            <input type="radio" name="choice" className="sr-only" checked={cur === o} disabled={tried.includes(o)} onChange={() => setSel(o)} />
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${cur === o ? "bg-primary text-on-primary" : "bg-primary-soft text-primary"}`}>{"ABCD"[i]}</span>
            <span className="min-w-0 break-words"><MathText text={asMath(o)} /></span>
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-2">
        <Button type="submit" block={false} disabled={!cur || !ready} pending={busy ? (ready ? "Đang chấm..." : "Đang mở bài...") : undefined} className="flex-1">Trả lời</Button>
        <Button variant="secondary" type="button" onClick={onHint} disabled={busy || !ready} className="text-sm">Gợi ý</Button>
      </div>
      <div className="hidden sm:block">{NOTE}</div>
    </form>
  );
}

// Thêm kiểu mới: thêm một ô nhập vào đây (khóa trùng với lib/modes.ts).
export const INPUTS: Record<Mode, ComponentType<InputProps>> = { chat: ChatInput, steps: StepInput, quiz: QuizInput };
