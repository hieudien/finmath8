"use client";
import { useState } from "react";
import { AiButton, post, toast, useRefresh } from "@/components/ui";

// Nút gọi AI cho một đề. Mặc định "Chuẩn hóa đề": cùng đường với nút hàng loạt (action finish, một id); action "verify" chỉ kiểm tra đáp án.
export function ExplainButton({ id, action = "finish", label = "Chuẩn hóa đề", busyLabel = "AI đang chuẩn hóa đề..." }: { id: string; action?: "finish" | "verify"; label?: string; busyLabel?: string }) {
  const [rp, refresh] = useRefresh();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <AiButton
        onClick={async () => {
          setBusy(true);
          const { ok, data } = await post<{ failed?: { reason: string }[]; left?: string[]; error?: string }>("/api/problems", action === "finish" ? { action, ids: [id] } : { action, id });
          setBusy(false);
          const err = ok ? data.failed?.[0]?.reason ?? (data.left?.length ? "Hết thời gian, bấm lại để làm tiếp." : "") : data.error ?? "Có lỗi.";
          if (err) toast("danger", err); else refresh();
        }}
        pending={busy ? busyLabel : rp ? "Đang cập nhật..." : undefined}
        className="self-start"
      >
        {label}
      </AiButton>
    </div>
  );
}
