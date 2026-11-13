"use client";
import { useState } from "react";
import { Badge, ScoreBadge, StatusBadge } from "@/components/ui";
import { MathText } from "@/components/MathText";

type Item = { role: "student" | "bot"; time: string; html: string };
type Analysis = { summary: string; strengths: string[]; weaknesses: string[]; next_steps: string[] };
type Head = { time: string; problem: string; total?: number; state: string; helped?: number };

const Block = ({ title, items }: { title: string; items: string[] }) => items.length > 0 && (
  <div><h4 className="font-medium">{title}</h4><ul className="list-disc space-y-1 pl-5">{items.map((x, i) => <li key={i}><MathText text={x} /></li>)}</ul></div>
);

// Bản chỉ đọc của ChatLog cho phụ huynh: không mã phiên, không nút AI. Nhận xét hiện ngay khi mở; hội thoại nằm trong mục thu gọn.
export default function ParentChatLog({ token, id, head }: { token: string; id: string; head: Head }) {
  const [data, setData] = useState<{ items: Item[]; problem: { title: string; statement: string } | null; analysis: Analysis | null } | null>(null);
  const [err, setErr] = useState(false);
  const load = async () => {
    if (data) return;
    setErr(false);
    try {
      const r = await fetch(`/api/p/${token}/log?session=${id}`);
      if (!r.ok) throw new Error();
      setData(await r.json());
    } catch { setErr(true); }
  };
  return (
    <details className="rounded-sm border border-border bg-surface px-3" onToggle={(e) => e.currentTarget.open && void load()}>
      <summary className="min-h-11 cursor-pointer py-2">
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 align-middle">
          <span className="tnum text-sm text-text-muted">{head.time}</span>
          <Badge tone="info">{head.problem}</Badge>
          {head.total != null && <ScoreBadge total={head.total} />}
          <StatusBadge text={head.state} />
          {!!head.helped && <Badge tone="warn">Được giải hộ {head.helped} bước</Badge>}
        </span>
      </summary>
      <div className="flex flex-col gap-3 pb-3 text-sm">
        {!data && !err && <p className="text-text-muted">Đang tải…</p>}
        {err && <p className="text-danger">Không tải được. Đóng rồi mở lại để thử lại.</p>}
        {data?.analysis && (
          <div className="flex flex-col gap-3 rounded-lg bg-primary-soft p-3">
            <p><MathText text={data.analysis.summary} /></p>
            <Block title="Làm tốt" items={data.analysis.strengths} />
            <Block title="Còn yếu" items={data.analysis.weaknesses} />
            <Block title="Nên làm tiếp" items={data.analysis.next_steps} />
          </div>
        )}
        {data?.problem && (
          <div className="rounded-lg border border-border p-3">
            <p className="font-medium">{data.problem.title}</p>
            {data.problem.statement && <div className="mt-1 max-h-40 overflow-y-auto"><MathText text={data.problem.statement} /></div>}
          </div>
        )}
        {data && (
          <details className="rounded-lg border border-border px-3">
            <summary className="min-h-11 cursor-pointer py-2 font-medium">Xem hội thoại ({data.items.length} tin)</summary>
            <ul className="mb-3 flex max-h-[50dvh] flex-col gap-2 overflow-y-auto pr-1">
              {data.items.map((m, i) => (
                <li key={i} className={`max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 ${m.role === "bot" ? "self-start border border-border" : "self-end bg-primary-soft"}`}>
                  <span className="block text-xs text-text-muted">{m.role === "bot" ? "Chatbot" : "Học sinh"} · {m.time}</span>
                  <span dangerouslySetInnerHTML={{ __html: m.html }} />
                </li>
              ))}
              {data.items.length === 0 && <li className="text-text-muted">Chưa có tin nhắn.</li>}
            </ul>
          </details>
        )}
      </div>
    </details>
  );
}
