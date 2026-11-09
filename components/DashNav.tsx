"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Brand from "@/components/Brand";
import { Alert, Button, post } from "@/components/ui";

function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="spinner ml-2" role="status" aria-label="Đang tải" /> : null;
}

const ITEMS = [
  ["/dashboard", "Tổng quan"],
  ["/dashboard/problems", "Đề bài"],
  ["/dashboard/links", "Liên kết"],
  ["/dashboard/stats", "Thống kê"],
  ["/dashboard/students", "Học sinh"],
  ["/dashboard/settings", "Cài đặt"],
  ["/dashboard/guide", "Hướng dẫn"],
] as const;

export default function DashNav({ email }: { email: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const burger = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const cur = (href: string) => (href === "/dashboard" ? path === href : path.startsWith(href));

  // Đóng menu khi chuyển trang.
  useEffect(() => setOpen(false), [path]);

  // Khi mở: khóa cuộn nền, đưa focus vào menu, Esc để đóng. Khi đóng: trả focus về nút burger.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const btn = burger.current;
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      btn?.focus();
    };
  }, [open]);

  async function logout() {
    setBusy(true);
    setErr("");
    const { ok, data } = await post("/api/auth/logout", {}, 10000);
    if (!ok) {
      setBusy(false);
      return setErr(data.error ?? "Chưa đăng xuất được. Thử lại.");
    }
    // Tải lại hẳn trang (không dùng router.replace) để xóa bộ nhớ đệm trang của tài khoản vừa thoát: máy dùng chung không lộ dữ liệu cho người sau.
    window.location.assign("/login");
  }

  const link = (href: string, label: string, cls: string) => (
    <Link key={href} href={href} aria-current={cur(href) ? "page" : undefined} className={`${cls} ${cur(href) ? "bg-primary-soft font-medium text-primary" : "text-text hover:bg-primary-soft"}`}>
      {label}
      <Pending />
    </Link>
  );
  const itemCls = "flex min-h-12 items-center rounded-sm px-3";

  return (
    <>
      {/* Mobile: thanh trên + menu burger */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2 md:hidden">
        <Link href="/dashboard" aria-label="MathStep AI, về tổng quan"><Brand size="sm" /></Link>
        <button
          ref={burger}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Mở menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="grid size-11 place-items-center rounded-sm hover:bg-primary-soft"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-30 md:hidden">
          <button type="button" aria-label="Đóng menu" tabIndex={-1} onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50" />
          <div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] flex-col bg-surface shadow-[var(--shadow-2)]"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="font-medium">Menu</span>
              <button ref={closeBtn} type="button" onClick={() => setOpen(false)} aria-label="Đóng menu" className="grid size-11 place-items-center rounded-sm hover:bg-primary-soft">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <nav aria-label="Chính" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
              {ITEMS.map(([h, l]) => link(h, l, itemCls))}
            </nav>
            <div className="flex flex-col gap-2 border-t border-border p-4">
              <p className="truncate text-sm text-text-muted" title={email}>{email}</p>
              {err && <Alert tone="danger">{err}</Alert>}
              <Button variant="secondary" onClick={logout} pending={busy ? "Đang đăng xuất..." : undefined}>Đăng xuất</Button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop: thanh bên */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-border bg-surface p-4 md:flex">
        <Link href="/dashboard" className="mb-4" aria-label="MathStep AI, về tổng quan"><Brand /></Link>
        <nav aria-label="Chính" className="min-h-0 flex-1 overflow-y-auto flex flex-col gap-1">{ITEMS.map(([h, l]) => link(h, l, "flex min-h-11 items-center rounded-sm px-3"))}</nav>
        <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-border pt-3">
          <p className="truncate text-sm text-text-muted" title={email}>{email}</p>
          {err && <Alert tone="danger">{err}</Alert>}
              <Button variant="secondary" onClick={logout} pending={busy ? "Đang đăng xuất..." : undefined}>Đăng xuất</Button>
        </div>
      </aside>
    </>
  );
}
