"use client";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

const BTN = "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const VARIANT = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  secondary: "border border-border-strong bg-surface text-text hover:bg-primary-soft",
  danger: "bg-danger text-white hover:opacity-90",
  ghost: "text-primary hover:bg-primary-soft",
};

// Lớp phủ toàn trang khi tác vụ dài đang chạy: chặn chuột và bàn phím ở mọi chỗ khác.
// Đếm số lớp phủ đang mở: nhiều nút cùng "pending" (cùng một state busy) mở nhiều lớp phủ; lớp sau đọc inert đã bị lớp trước bật
// nên khôi phục sai và trang kẹt inert. Chỉ lớp đầu bật, lớp cuối tắt.
let overlays = 0;
let frozen: { el: HTMLElement; prev: boolean }[] = [];
function BlockOverlay({ text }: { text: string }) {
  useEffect(() => {
    if (overlays++ === 0) {
      frozen = ([...document.body.children].filter((el) => !el.hasAttribute("data-block-overlay")) as HTMLElement[]).map((el) => ({ el, prev: el.inert }));
      frozen.forEach(({ el }) => { el.inert = true; });
    }
    return () => {
      if (--overlays === 0) { frozen.forEach(({ el, prev }) => { el.inert = prev; }); frozen = []; }
    };
  }, []);
  return createPortal(
    <div data-block-overlay role="status" aria-live="polite" className="fixed inset-0 z-50 flex cursor-wait flex-col items-center justify-center gap-3 bg-black/50 text-lg font-medium text-white">
      <span className="spinner h-8 w-8" />
      {text}
    </div>,
    document.body,
  );
}

export function Button({ variant = "primary", pending, block = true, children, className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT; pending?: string; block?: boolean }) {
  return (
    <button {...p} disabled={p.disabled || !!pending} className={`${BTN} ${VARIANT[variant]} ${className}`}>
      {pending ?? children}
      {pending && block && <BlockOverlay text={pending} />}
    </button>
  );
}

export function LinkButton({ href, variant = "primary", children, className = "" }: { href: string; variant?: keyof typeof VARIANT; children: ReactNode; className?: string }) {
  return <Link href={href} className={`${BTN} ${VARIANT[variant]} ${className}`}>{children}</Link>;
}

const FIELD = "min-h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-text placeholder:text-text-muted";

export function Field({ label, hint, error, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const d = `${id}-d`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">{label}</label>
      <input id={id} {...p} aria-invalid={!!error} aria-describedby={hint || error ? d : undefined} className={FIELD} />
      {(hint || error) && <p id={d} className={`text-sm ${error ? "text-danger" : "text-text-muted"}`}>{error ?? hint}</p>}
    </div>
  );
}

export function TextArea({ label, hint, className = "", ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">{label}</label>
      <textarea id={id} {...p} aria-describedby={hint ? `${id}-d` : undefined} className={`${FIELD} py-2 ${className}`} />
      {hint && <p id={`${id}-d`} className="text-sm text-text-muted">{hint}</p>}
    </div>
  );
}

const TONE = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};
const MARK = { success: "Xong:", warning: "Lưu ý:", danger: "Lỗi:", info: "Thông tin:" };

export function Alert({ tone = "info", children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-sm px-3 py-2 text-sm ${TONE[tone]}`}>
      <strong>{MARK[tone]}</strong> {children}
    </div>
  );
}

export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 border border-dashed border-border-strong rounded-lg p-8 text-center">
      <p className="text-text-muted">{text}</p>
      {action}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton h-5" style={{ width: `${90 - i * 15}%` }} />)}
    </div>
  );
}

export function Confirm({ label, message, onConfirm, confirmLabel = "Xóa" }: { label: string; message: string; onConfirm: () => Promise<void> | void; confirmLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} className="text-danger">{label}</Button>
      {open && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <div className="w-full max-w-md rounded-t-lg bg-surface p-6 sm:rounded-lg" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
            <h2>{label}?</h2>
            <p className="mt-2 text-text-muted">{message}</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" autoFocus onClick={() => setOpen(false)}>Hủy</Button>
              <Button variant="danger" pending={busy ? "Đang xử lý..." : undefined} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); setOpen(false); } }}>{confirmLabel}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant="secondary" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); }}>
      {done ? "Đã chép" : "Chép liên kết"}
    </Button>
  );
}

const CONTACT = process.env.NEXT_PUBLIC_ADMIN_CONTACT ? `Hãy liên hệ quản trị viên: ${process.env.NEXT_PUBLIC_ADMIN_CONTACT}.` : "Hãy liên hệ quản trị viên.";

// Mọi lỗi (mất mạng, máy chủ trả sai, hết phiên đăng nhập) đều thành câu dễ hiểu có hướng xử lý.
export async function post<T = unknown>(url: string, body: unknown, timeoutMs = 60000): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const fail = (error: string) => ({ ok: false, data: { error } as T & { error?: string } });
  let r: Response;
  try {
    r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if ((e as Error)?.name === "TimeoutError") return fail("Máy chủ phản hồi quá lâu. Thử lại sau ít phút. Nếu vẫn chậm, hãy liên hệ quản trị viên.");
    return fail("Không kết nối được máy chủ. Kiểm tra mạng Internet rồi thử lại.");
  }
  const data = await r.json().catch(() => null);
  if (r.ok) return { ok: true, data: data ?? ({} as T & { error?: string }) };
  if (data?.error) return { ok: false, data };
  if (r.status === 401) return fail("Phiên đăng nhập đã hết. Hãy tải lại trang và đăng nhập lại.");
  if (r.status === 429) return fail("Bạn thao tác nhanh quá. Chờ một chút rồi thử lại.");
  return fail(`Máy chủ đang gặp sự cố (mã ${r.status}). Thử lại sau ít phút. ${CONTACT}`);
}
