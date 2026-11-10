"use client";
import { useEffect } from "react";

const seen = new Set<string>();

// Gửi lỗi xảy ra trên trình duyệt về nhật ký lỗi. Mỗi thông báo gửi 1 lần, tối đa 5 lỗi mỗi lần tải trang.
export function reportClient(message: string, stack?: string) {
  const m = message.slice(0, 300);
  if (!m || seen.has(m) || seen.size >= 5) return;
  seen.add(m);
  const path = location.pathname;
  const slug = path.startsWith("/c/") ? path.split("/")[2] : undefined;
  try {
    void fetch("/api/client-error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: m, stack: stack?.slice(0, 1500), path: path.slice(0, 200), slug }), keepalive: true }).catch(() => {});
  } catch { /* không để việc báo lỗi gây thêm lỗi */ }
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
