"use client";
import { useEffect, useState } from "react";
import { Button, Confirm, CopyButton, post, toast } from "@/components/ui";

type R = { token: string | null };

// Liên kết công khai cho phụ huynh. Lần đầu bấm phải xác nhận (liên kết công khai, kèm nhận xét do AI viết); đã có liên kết thì hiện ngay để chép hoặc thu hồi.
export default function ShareButton({ code }: { code: string }) {
  const [token, setToken] = useState<string | null | undefined>(undefined); // undefined = đang tải
  const [ask, setAsk] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void post<R>("/api/students", { action: "share_get", code }).then(({ ok, data }) => setToken(ok ? data.token : null));
  }, [code]);
  const url = token ? `${window.location.origin}/p/${token}` : "";
  const create = async () => {
    setBusy(true);
    const { ok, data } = await post<R>("/api/students", { action: "share_create", code });
    setBusy(false);
    if (!ok || !data.token) return toast("danger", data.error ?? "Có lỗi.");
    setToken(data.token); setAsk(false); setOpen(true);
  };
  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" block={false} disabled={token === undefined} onClick={() => (token ? setOpen(!open) : setAsk(true))}>Chia sẻ cho phụ huynh</Button>
      {open && token && (
        <div className="flex w-full max-w-xl flex-col gap-2 rounded-lg border border-border bg-surface p-3">
          <p className="text-sm text-text-muted">Ai có liên kết này đều xem được kết quả của học sinh. Không hết hạn cho đến khi bạn thu hồi.</p>
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="tnum min-h-11 w-full rounded-sm border border-border bg-bg px-3 text-sm" aria-label="Liên kết cho phụ huynh" />
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={url} />
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center px-2 text-primary underline">Mở thử</a>
            <Confirm label="Thu hồi liên kết" confirmLabel="Thu hồi" message="Liên kết hiện tại sẽ ngừng dùng được ngay. Muốn chia sẻ lại thì tạo liên kết mới." onConfirm={async () => {
              const { ok, data } = await post<R>("/api/students", { action: "share_revoke", code });
              if (!ok) return data.error ?? "Có lỗi.";
              setToken(null); setOpen(false);
            }} />
          </div>
        </div>
      )}
      {ask && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" onKeyDown={(e) => e.key === "Escape" && setAsk(false)}>
          <div className="w-full max-w-md rounded-t-lg bg-surface p-6 sm:rounded-lg" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
            <h2>Tạo liên kết cho phụ huynh?</h2>
            <p className="mt-2 text-text-muted">Đây là liên kết công khai: ai có liên kết đều xem được bài làm, hội thoại và nhận xét của học sinh. Nhận xét do AI viết, bạn nên xem lại trước khi gửi cho phụ huynh. Liên kết không hết hạn, bạn có thể thu hồi bất cứ lúc nào.</p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" autoFocus onClick={() => setAsk(false)}>Hủy</Button>
              <Button pending={busy ? "Đang tạo..." : undefined} onClick={create}>Tạo liên kết</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
