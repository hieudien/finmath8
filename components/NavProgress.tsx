"use client";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Thanh tiến trình mỏng ở đầu màn hình: hiện ngay khi bấm liên kết nội bộ, tắt khi trang mới đã đổi.
function Bar() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [loading, setLoading] = useState(false);

  useEffect(() => setLoading(false), [path, search]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin) return;
      if (u.pathname === location.pathname && u.search === location.search) return;
      setLoading(true);
      clearTimeout(timer);
      timer = setTimeout(() => setLoading(false), 15000); // chốt chặn: không để thanh chạy mãi nếu điều hướng lỗi
    };
    document.addEventListener("click", onClick, true); // pha capture: chạy trước Link của Next (nó gọi preventDefault)
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  if (!loading) return null;
  return (
    <div role="progressbar" aria-label="Đang tải trang" aria-busy="true" className="pointer-events-none fixed inset-x-0 top-0 z-40 h-1 overflow-hidden bg-primary-soft">
      <div className="nav-progress-bar" />
    </div>
  );
}

export default function NavProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}
