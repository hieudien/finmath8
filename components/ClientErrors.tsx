"use client";
import { useEffect } from "react";

const seen = new Set<string>();

// Gửi lỗi xảy ra trên trình duyệt về nhật ký lỗi. Mỗi thông báo gửi 1 lần, tối đa 20 lỗi mỗi lần tải trang (server giới hạn thêm 10 lỗi/phút/IP).
// Trả mã lỗi để hiện cho người dùng; trả undefined nếu đã gửi rồi, quá hạn mức hoặc không gửi được.
export async function reportClient(message: string, stack?: string): Promise<string | undefined> {
  const m = message.slice(0, 300);
  if (!m || seen.has(m) || seen.size >= 20) return undefined;
  seen.add(m);
  const path = location.pathname;
  const slug = path.startsWith("/c/") ? path.split("/")[2] : undefined;
  try {
    const r = await fetch("/api/client-error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: m, stack: stack?.slice(0, 1500), path: path.slice(0, 200), slug }), keepalive: true });
    const j = await r.json().catch(() => null);
    return typeof j?.ref === "string" ? j.ref : undefined;
  } catch { return undefined; /* không để việc báo lỗi gây thêm lỗi */ }
}

export default function ClientErrors() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClient(e.message || "Lỗi không rõ", e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => reportClient(String(e.reason?.message ?? e.reason ?? "Promise bị từ chối"), e.reason?.stack);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
