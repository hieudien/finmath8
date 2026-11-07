"use client";
import { useState } from "react";

type Item = { role: "student" | "bot"; time: string; html: string };

// Chỉ tải và dựng hội thoại khi giáo viên mở từng học sinh (trước đây dựng KaTeX cho mọi tin nhắn ngay lúc tải trang).
export default function ChatLog({ id, title }: { id: string; title: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState(false);
  const load = async () => {
    if (items) return;
    setErr(false);
    try {
      const r = await fetch(`/api/chat-log?session=${id}`);
      if (!r.ok) throw new Error();
      setItems((await r.json()).items);
    } catch { setErr(true); }
  };
  return (
    <details className="rounded-sm border border-border bg-surface px-3" onToggle={(e) => e.currentTarget.open && void load()}>
      <summary className="min-h-11 cursor-pointer py-2 font-medium">{title}</summary>
      <ul className="flex flex-col gap-2 pb-3">
        {items?.map((m, i) => (
          <li key={i} className={`max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === "bot" ? "self-start border border-border" : "self-end bg-primary-soft"}`}>
            <span className="block text-xs text-text-muted">{m.role === "bot" ? "Chatbot" : "Học sinh"} · {m.time}</span>
            <span dangerouslySetInnerHTML={{ __html: m.html }} />
          </li>
        ))}
        {items?.length === 0 && <li className="text-sm text-text-muted">Chưa có tin nhắn.</li>}
        {!items && !err && <li className="text-sm text-text-muted">Đang tải…</li>}
        {err && <li className="text-sm text-danger">Không tải được. Đóng rồi mở lại để thử lại.</li>}
      </ul>
    </details>
  );
}
