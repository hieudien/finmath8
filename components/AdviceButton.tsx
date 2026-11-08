"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, post } from "@/components/ui";

export default function AdviceButton({ code, has }: { code: string; has: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run() {
    setBusy(true); setErr("");
    const { ok, data } = await post("/api/students", { action: "advise", code });
    setBusy(false);
    if (ok) router.refresh(); else setErr(data.error ?? "Có lỗi.");
  }
  return (
    <div className="flex flex-col gap-2">
      <div><Button variant="secondary" onClick={run} pending={busy ? "AI đang phân tích..." : undefined}>{has ? "Phân tích lại bằng AI" : "AI phân tích và đề xuất cải thiện"}</Button></div>
      {err && <Alert tone="danger">{err}</Alert>}
    </div>
  );
}
