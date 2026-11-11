"use client";
import { createContext, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Ngăn kéo bên phải cho trang xem/sửa đề (route chặn @panel). Đóng = lùi lại một bước lịch sử, về đúng trang bên dưới.
// Trang sửa báo "đã gõ dở" qua markDirty để hỏi trước khi đóng.
const Ctx = createContext<{ markDirty: (v: boolean) => void; close: () => void } | null>(null);
export const useFlyout = () => useContext(Ctx);

export function Flyout({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const dirty = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const close = (force = false) => {
    if (!force && dirty.current && !window.confirm("Có thay đổi chưa lưu. Đóng và bỏ các thay đổi này?")) return;
    dirty.current = false;
    router.back();
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.focus();
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <Ctx.Provider value={{ markDirty: (v) => { dirty.current = v; }, close: () => close(true) }}>
      <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => close()}>
        <div
          ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") return close();
            if (e.key !== "Tab") return;
            // Giữ Tab trong flyout, không nhảy ra trang phía sau nền mờ.
            const els = [...e.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
            if (!els.length) return;
            const first = els[0], last = els[els.length - 1], cur = document.activeElement;
            if (e.shiftKey && (cur === first || cur === e.currentTarget)) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
          }}
          className="flyout-in flex h-dvh w-full max-w-3xl flex-col bg-surface shadow-xl outline-none sm:w-[720px]"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
            <p className="font-medium text-text-muted">{title}</p>
            <button type="button" onClick={() => close()} className="inline-flex min-h-11 items-center rounded-sm px-3 font-medium text-primary hover:bg-primary-soft">Đóng</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-4">{children}</div>
        </div>
      </div>
    </Ctx.Provider>
  );
}

// Route chặn [id] cũng khớp "new", "bulk", "imports": Next giữ nguyên trang bên dưới khi chặn, nên với các đường đó ta tải lại trang đầy đủ.
export function HardNav() {
  useEffect(() => { window.location.replace(window.location.pathname + window.location.search); }, []);
  return null;
}
