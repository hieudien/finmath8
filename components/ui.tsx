"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { reportClient } from "@/components/ClientErrors";
import { toTen } from "@/lib/score";
import { useEffect, useId, useState, useSyncExternalStore, useTransition, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

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

// Tải lại dữ liệu trang. pending giữ đến khi dữ liệu mới về và hiện xong (router.refresh() trần thì không chờ được), để nút không hết quay trước khi danh sách đổi.
export function useRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return [pending, () => start(() => router.refresh())] as const;
}

const BADGE = {
  neutral: "bg-primary-soft text-text-muted",
  info: "bg-primary-soft text-primary",
  success: "bg-success/10 text-success",
  warn: "bg-warning-soft text-warning",
  danger: "bg-danger/10 text-danger",
} as const;

// Nhãn nhỏ dạng viên thuốc để mắt bắt nhanh mã, điểm, trạng thái.
export function Badge({ tone = "neutral", mono, children }: { tone?: keyof typeof BADGE; mono?: boolean; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${mono ? "font-mono" : ""} ${BADGE[tone]}`}>{children}</span>;
}

// "Chưa trả lời" nổi bật nhất để giáo viên thấy ngay phiên học sinh chưa làm gì; "Đang làm" khác "Bỏ dở".
const STATE_TONE: Record<string, keyof typeof BADGE> = { "Chưa trả lời": "warn", "Đúng": "success", "Chưa đúng": "danger", "Hoàn thành": "success", "Đang làm": "info" };
export const StatusBadge = ({ text }: { text: string }) => <Badge tone={STATE_TONE[text] ?? "neutral"}>{text}</Badge>;

// Điểm quy đổi thang 10 (DB lưu 0–12), tô màu: từ 7,5 xanh, từ 4 vàng, dưới 4 đỏ.
export const ScoreBadge = ({ total }: { total: number }) => { const t = toTen(total); return <Badge tone={t >= 7.5 ? "success" : t >= 4 ? "warn" : "danger"}>{t}/10</Badge>; };

export function Button({ variant = "primary", pending, block = true, children, className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT; pending?: string; block?: boolean }) {
  return (
    <button {...p} disabled={p.disabled || !!pending} className={`${BTN} ${VARIANT[variant]} ${className}`}>
      {pending ?? children}
      {pending && block && <BlockOverlay text={pending} />}
    </button>
  );
}

// Huy hiệu báo thao tác gọi AI, tốn token của giáo viên.
export const AiBadge = () => <span title="Gọi AI, có thể tốn token"><Badge tone="info">AI</Badge></span>;

// Nút gọi AI: gắn huy hiệu AI và hỏi xác nhận trước khi chạy onClick.
export function AiButton({ onClick, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT; pending?: string; block?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button {...p} type="button" onClick={() => setOpen(true)}>{children} <AiBadge /></Button>
      {open && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <div className="w-full max-w-md rounded-t-lg bg-surface p-6 sm:rounded-lg" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
            <h2>Gọi AI?</h2>
            <p className="mt-2 text-text-muted">Thao tác này gọi AI và có thể tốn token. Tiếp tục?</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" autoFocus onClick={() => setOpen(false)}>Hủy</Button>
              <Button onClick={(e) => { setOpen(false); onClick?.(e); }}>Tiếp tục</Button>
            </div>
          </div>
        </div>
      )}
    </>
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

// Chọn lớp bắt buộc: không có giá trị mặc định, để AI dùng đúng kiến thức lớp đó.
export function GradeSelect({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">Lớp (bắt buộc)</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD}>
        <option value="">Chọn lớp</option>
        {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>Lớp {i + 1}</option>)}
      </select>
      <p className="text-sm text-text-muted">{hint ?? "AI chỉ dùng kiến thức học đến hết lớp này khi giải và hướng dẫn."}</p>
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

// Thông báo nổi tự tắt (lỗi 8s, còn lại 5s). Gọi toast() từ bất kỳ đâu; ToastHost gắn một lần ở layout.
type Toast = { id: number; tone: keyof typeof TONE; text: string };
let toasts: Toast[] = [];
let tid = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
function dismissToast(id: number) { toasts = toasts.filter((t) => t.id !== id); emit(); }
export function toast(tone: keyof typeof TONE, text: string) {
  const id = ++tid;
  toasts = [...toasts.slice(-2), { id, tone, text }]; // tối đa 3 cái cùng lúc
  emit();
  setTimeout(() => dismissToast(id), tone === "danger" ? 8000 : 5000);
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const NONE: Toast[] = [];

export function ToastHost() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => NONE);
  if (!list.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      {list.map((t) => (
        <div key={t.id} role={t.tone === "danger" ? "alert" : "status"} className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-sm px-4 py-3 text-sm shadow-[var(--shadow-2)] ring-1 ring-current/20 ${TONE[t.tone]}`}>
          <p className="flex-1"><strong>{MARK[t.tone]}</strong> {t.text}</p>
          <button type="button" aria-label="Đóng thông báo" onClick={() => dismissToast(t.id)} className="grid size-6 shrink-0 place-items-center rounded-sm hover:bg-black/10">✕</button>
        </div>
      ))}
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

export function Confirm({ label, message, onConfirm, confirmLabel = "Xóa" }: { label: string; message: string; onConfirm: () => Promise<string | void> | string | void; confirmLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rp, refresh] = useRefresh();
  const [sent, setSent] = useState(false);
  // Đóng hộp thoại khi đã xóa xong VÀ danh sách đã tải lại.
  useEffect(() => { if (sent && !busy && !rp) { setSent(false); setOpen(false); } }, [sent, busy, rp]);
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
              <Button variant="danger" pending={busy || rp ? "Đang xử lý..." : undefined} onClick={async () => {
                setBusy(true);
                try {
                  const e = await onConfirm();
                  if (e) toast("danger", e); else { setSent(true); refresh(); }
                } catch { toast("danger", "Có lỗi."); } finally { setBusy(false); }
              }}>{confirmLabel}</Button>
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
  const t0 = Date.now(), act = (body as { action?: unknown } | null)?.action;
  // Lỗi chỉ xảy ra phía trình duyệt (hết giờ, mất mạng, phản hồi hỏng) thì server không biết: báo về nhật ký, chỉ kèm đường dẫn, action, loại lỗi (không kèm nội dung gửi đi).
  // Chờ mã lỗi tối đa 3 giây để hiện cho người dùng gửi admin.
  const note = async (what: string) => {
    const ref = await Promise.race([reportClient(`post ${url}${typeof act === "string" ? ` [${act}]` : ""}: ${what} sau ${Math.round((Date.now() - t0) / 1000)}s`), new Promise<undefined>((res) => setTimeout(res, 3000))]);
    return ref ? ` Mã lỗi: ${ref}.` : "";
  };
  let r: Response;
  try {
    r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if ((e as Error)?.name === "TimeoutError") return fail(`Máy chủ phản hồi quá lâu. Thử lại sau ít phút. Nếu vẫn chậm, hãy liên hệ quản trị viên.${await note("hết giờ chờ")}`);
    return fail(`Không kết nối được máy chủ. Kiểm tra mạng Internet rồi thử lại.${await note("mất kết nối")}`);
  }
  const data = await r.json().catch(() => null);
  if (r.ok) {
    if (data === null) void reportClient(`post ${url}${typeof act === "string" ? ` [${act}]` : ""}: HTTP ${r.status} nhưng phản hồi không phải JSON`);
    return { ok: true, data: data ?? ({} as T & { error?: string }) };
  }
  if (data?.error) {
    // Có mã lỗi: server đã ghi. Lỗi 4xx là lỗi nhập liệu thường. Còn lại (5xx không mã) thì ghi thêm từ đây.
    if (r.status >= 500 && !data.ref) void reportClient(`post ${url}${typeof act === "string" ? ` [${act}]` : ""}: HTTP ${r.status} không có mã lỗi: ${String(data.error).slice(0, 120)}`);
    return { ok: false, data };
  }
  if (r.status === 401) return fail("Phiên đăng nhập đã hết. Hãy tải lại trang và đăng nhập lại.");
  if (r.status === 429) return fail("Bạn thao tác nhanh quá. Chờ một chút rồi thử lại.");
  return fail(`Máy chủ đang gặp sự cố (mã ${r.status}). Thử lại sau ít phút. ${CONTACT}${await note(`HTTP ${r.status}`)}`);
}
