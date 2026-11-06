"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, post } from "@/components/ui";

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

export function ExplainButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="flex flex-col gap-2 print:hidden">
      <Button
        onClick={async () => {
          setBusy(true);
          setErr("");
          const { ok, data } = await post("/api/problems", { action: "explain", id });
          setBusy(false);
          if (ok) router.refresh();
          else setErr(data.error ?? "Có lỗi.");
        }}
        pending={busy ? "AI đang viết lời giải..." : undefined}
        className="self-start"
      >
        Tạo lời giải bằng AI
      </Button>
      {err && <Alert tone="danger">{err}</Alert>}
    </div>
  );
}
