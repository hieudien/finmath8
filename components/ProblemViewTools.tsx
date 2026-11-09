"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, post, useRefresh } from "@/components/ui";

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
  const [warn, setWarn] = useState("");
  return (
    <div className="flex flex-col gap-2 print:hidden">
      <Button
        onClick={async () => {
          setBusy(true);
          setErr(""); setWarn("");
          const { ok, data } = await post<{ noQuiz?: boolean; rewrote?: boolean }>("/api/problems", { action, id });
          setBusy(false);
          if (ok) { if (data.rewrote) setWarn("Lời giải cũ có bước quá chung chung nên AI đã viết lại lời giải và tạo trắc nghiệm. Hãy xem lại lời giải mới."); else if (data.noQuiz) setWarn("Đã tạo chỉ dẫn và gợi ý, nhưng AI chưa tạo được trắc nghiệm hợp lệ (có bước quá chung chung). Đề này chạy kiểu Từng bước. Bấm thử lại hoặc sửa lời giải cho rõ kết quả từng bước."); refresh(); }
          else setErr(data.error ?? "Có lỗi.");
        }}
        pending={busy ? busyLabel : rp ? "Đang cập nhật..." : undefined}
        className="self-start"
      >
        {label}
      </Button>
      {err && <Alert tone="danger">{err}</Alert>}
      {warn && <Alert tone="warning">{warn}</Alert>}
    </div>
  );
}
