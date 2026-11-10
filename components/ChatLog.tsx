"use client";
import { useEffect, useRef, useState } from "react";
import { AiButton, Badge, post, ScoreBadge, StatusBadge, toast } from "@/components/ui";
import { MathText } from "@/components/MathText";

type Item = { role: "student" | "bot"; time: string; html: string };
export type Head = { sid: string; time: string; who?: string; problem: string; total?: number; state: string; helped?: number };
type Problem = { id: string; title: string; statement: string };
type Analysis = { content: { summary: string; strengths: string[]; weaknesses: string[]; next_steps: string[] }; updated_at: string };

const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
const Block = ({ title, items }: { title: string; items: string[] }) => items.length > 0 && (
  <div><h4 className="font-medium">{title}</h4><ul className="list-disc space-y-1 pl-5">{items.map((x, i) => <li key={i}><MathText text={x} /></li>)}</ul></div>
);

// Chỉ tải và dựng hội thoại khi giáo viên mở từng học sinh (trước đây dựng KaTeX cho mọi tin nhắn ngay lúc tải trang).
// open: mở sẵn và cuộn tới (đến từ link "bước yếu"); note: các bước học sinh gặp khó trong phiên này.
export default function ChatLog({ id, head, open, note }: { id: string; head: Head; open?: boolean; note?: string[] }) {
  const box = useRef<HTMLDetailsElement>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState(false);
  const [an, setAn] = useState<Analysis | null>(null);
  const [prob, setProb] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const analyze = async () => {
    setBusy(true);
    const { ok, data } = await post<{ analysis: Analysis }>("/api/students", { action: "analyze_session", id });
    setBusy(false);
    if (ok) setAn(data.analysis); else toast("danger", data.error ?? "Có lỗi.");
  };
  const load = async () => {
    if (items) return;
    setErr(false);
    try {
      const r = await fetch(`/api/chat-log?session=${id}`);
      if (!r.ok) throw new Error();
      const j = await r.json();
      setItems(j.items); setProb(j.problem ?? null); setAn(j.analysis ?? null);
    } catch { setErr(true); toast("danger", "Không tải được. Đóng rồi mở lại để thử lại."); }
  };
  useEffect(() => {
    if (!open || !box.current) return;
    box.current.open = true;
    box.current.scrollIntoView({ block: "start" });
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <details id={`s-${id}`} ref={box} className="scroll-mt-4 rounded-sm border border-border bg-surface px-3 target:border-primary" onToggle={(e) => e.currentTarget.open && void load()}>
      <summary className="min-h-11 cursor-pointer py-2">
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 align-middle">
          <Badge mono>{head.sid}</Badge>
          <span className="tnum text-sm text-text-muted">{head.time}</span>
          {head.who && <span className="font-medium">{head.who}</span>}
          <Badge tone="info">{head.problem}</Badge>
          {head.total != null && <ScoreBadge total={head.total} />}
          <StatusBadge text={head.state} />
          {!!head.helped && <Badge tone="warn">Giải hộ {head.helped} bước</Badge>}
        </span>
      </summary>
      {!!note?.length && <p className="mb-3 rounded-lg border border-border bg-primary-soft p-3 text-sm">Học sinh gặp khó ở: {note.join("; ")}</p>}
      {prob && (
        <div className="mb-3 rounded-lg border border-border bg-primary-soft p-3 text-sm">
          <p className="font-medium"><span className="tnum text-text-muted">{prob.id}</span> {prob.title}</p>
          {prob.statement && <div className="mt-1 max-h-48 overflow-y-auto"><MathText text={prob.statement} /></div>}
        </div>
      )}
      <ul className="mb-3 flex max-h-[60dvh] flex-col gap-2 overflow-y-auto pr-1">
        {items?.map((m, i) => (
          <li key={i} className={`max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === "bot" ? "self-start border border-border" : "self-end bg-primary-soft"}`}>
            <span className="block text-xs text-text-muted">{m.role === "bot" ? "Chatbot" : "Học sinh"} · {m.time}</span>
            <span dangerouslySetInnerHTML={{ __html: m.html }} />
          </li>
        ))}
        {items?.length === 0 && <li className="text-sm text-text-muted">Chưa có tin nhắn.</li>}
        {!items && !err && <li className="text-sm text-text-muted">Đang tải…</li>}
      </ul>
      {items && items.length > 0 && !items.some((m) => m.role === "student") && <p className="border-t border-border py-3 text-sm text-text-muted">Học sinh chưa trả lời tin nào, nên chưa có gì để phân tích.</p>}
      {items && items.some((m) => m.role === "student") && (
        <div className="flex flex-col gap-3 border-t border-border py-3 text-sm">
          {an && (
            <div className="flex flex-col gap-3 rounded-lg bg-primary-soft p-3">
              <p className="text-xs text-text-muted">AI phân tích lúc {fmt.format(new Date(an.updated_at))}</p>
              <p><MathText text={an.content.summary} /></p>
              <Block title="Làm tốt" items={an.content.strengths} />
              <Block title="Còn yếu" items={an.content.weaknesses} />
              <Block title="Nên làm tiếp" items={an.content.next_steps} />
            </div>
          )}
          <div><AiButton variant="secondary" onClick={analyze} pending={busy ? "AI đang phân tích..." : undefined} className="text-sm">{an ? "Phân tích lại phiên này" : "AI phân tích phiên này"}</AiButton></div>
        </div>
      )}
    </details>
  );
}
