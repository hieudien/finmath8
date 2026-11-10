"use client";
import { useEffect, useRef, useState } from "react";
import { AiButton, Alert, Button, post, useRefresh } from "@/components/ui";

export function ViewTools({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="flex flex-col gap-2 print:hidden">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setDone(true);
              setErr("");
              clearTimeout(timer.current);
              timer.current = setTimeout(() => setDone(false), 2000);
            } catch {
              setErr("Trình duyệt không cho sao chép tự động. Hãy bôi đen nội dung rồi sao chép thủ công.");
            }
          }}
        >
          {done ? "Đã sao chép" : "Sao chép dạng văn bản"}
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>In hoặc lưu PDF</Button>
      </div>
      {err && <Alert tone="warning">{err}</Alert>}
    </div>
  );
}

// Nút gọi AI cho một đề: mặc định tạo lời giải từng bước ("explain"); action "step_guides" tạo chỉ dẫn và gợi ý riêng từng bước.
export function ExplainButton({ id, action = "explain", label = "Tạo lời giải bằng AI", busyLabel = "AI đang viết lời giải..." }: { id: string; action?: "explain" | "step_guides" | "fill"; label?: string; busyLabel?: string }) {
  const [rp, refresh] = useRefresh();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="flex flex-col gap-2 print:hidden">
      <AiButton
        onClick={async () => {
          setBusy(true);
          setErr("");
          const { ok, data } = await post("/api/problems", { action, id });
          setBusy(false);
          if (ok) refresh(); else setErr(data.error ?? "Có lỗi.");
        }}
        pending={busy ? busyLabel : rp ? "Đang cập nhật..." : undefined}
        className="self-start"
      >
        {label}
      </AiButton>
      {err && <Alert tone="danger">{err}</Alert>}
    </div>
  );
}
