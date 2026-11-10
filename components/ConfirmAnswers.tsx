"use client";
import { useState } from "react";
import { Alert, Badge, Button, post, toast, useRefresh } from "@/components/ui";

export type AnswerRow = { id: string; code: string; title: string; answer: string; locked: boolean; check: "pass" | "fail" | "skip"; blocked: string };

// Xác nhận đáp án nhiều đề cùng lúc: hiện đáp án từng đề để giáo viên so với đáp án tự giải rồi mới khóa.
export default function ConfirmAnswers({ rows }: { rows: AnswerRow[] }) {
  const [rp, refresh] = useRefresh();
  const [sel, setSel] = useState<string[]>([]);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = rows.filter((r) => !r.blocked && !r.locked);
  const pickable = open.filter((r) => r.check !== "fail"); // "Không thỏa đề" phải được chọn riêng, không chọn sẵn
  const toggle = (id: string, on: boolean) => setSel((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  async function lock() {
    setBusy(true);
    const { ok, data } = await post<{ locked: number; skipped: { name: string; reason: string }[]; error?: string }>("/api/problems", { action: "lock_answers", ids: sel });
    setBusy(false);
    if (!ok) return toast("danger", data.error ?? "Có lỗi.");
    setAsk(false);
    toast(data.skipped.length ? "warning" : "success", `Đã khóa đáp án ${data.locked}/${sel.length} đề${data.skipped.length ? `. Bỏ qua: ${data.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}` : "."}`);
    setSel([]); refresh();
  }

  return (
    <details aria-labelledby="confirm-ans" className="group rounded-lg border border-border bg-surface p-4 md:p-6">
      <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-1.5 size-5 shrink-0 text-text-muted transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4l6 6-6 6" /></svg>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <h2 id="confirm-ans" className="inline">Xác nhận đáp án hàng loạt</h2>
            {open.length > 0 && <Badge tone="warn">{open.length} đề chưa xác nhận</Badge>}
          </span>
          <span className="text-sm font-normal text-text-muted">Khóa đáp án của nhiều đề cùng lúc sau khi thầy/cô đã tự kiểm tra. Đề đã khóa mới thêm được vào liên kết cho học sinh.</span>
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-sm text-text-muted">
        <p><strong>Cách dùng:</strong> tự giải từng đề, so với đáp án hiển thị bên dưới, tick các đề đúng rồi bấm &quot;Xác nhận đáp án đã chọn&quot;.</p>
        <p>AI có thể giải sai nên đáp án chưa khóa không được tin. Đề đã khóa: chuẩn hóa chỉ viết lại lời giải, gợi ý theo đáp án đó và không đổi đáp án. Đề sai đáp án thì mở trang sửa đề, sửa lại đáp án rồi xác nhận ở đó.</p>
        <p>Nhãn &quot;Khớp khi thay vào đề&quot; nghĩa là code đã thế nghiệm vào đề và đúng, nhưng vẫn cần thầy/cô xác nhận. &quot;Không thỏa đề&quot; là nhiều khả năng sai, nên không được chọn sẵn.</p>
      </div>
      {rows.length === 0 ? <p className="text-sm text-text-muted">Chưa có đề nào.</p> : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" block={false} disabled={!pickable.length} onClick={() => setSel(pickable.map((r) => r.id))}>Chọn tất cả đề chưa khóa ({pickable.length})</Button>
            <Button variant="ghost" block={false} disabled={!sel.length} onClick={() => setSel([])}>Bỏ chọn</Button>
          </div>
          <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-sm border border-border">
            {rows.map((r) => {
              const off = !!r.blocked || r.locked;
              return (
                <li key={r.id}>
                  <label className="flex min-h-11 items-start gap-3 px-3 py-2">
                    <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]" disabled={off} checked={r.locked || sel.includes(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2"><span><span className="tnum text-text-muted">{r.code}</span> {r.title}</span>
                        {r.locked ? <Badge tone="success">Đã khóa</Badge> : r.blocked ? <Badge tone="neutral">{r.blocked}</Badge> : <Badge tone="warn">Chưa xác nhận đáp án</Badge>}
                        {!off && r.check === "pass" && <Badge tone="success">Khớp khi thay vào đề</Badge>}
                        {!off && r.check === "fail" && <Badge tone="danger">Không thỏa đề</Badge>}
                      </span>
                      {r.answer && <code className="break-all font-mono text-xs text-text-muted">{r.answer}</code>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {ask ? (
            <Alert tone="warning">
              <p className="font-medium">Thầy/cô xác nhận đã tự kiểm tra {sel.length} đáp án này là đúng?</p>
              <p>Đáp án được khóa, chuẩn hóa không còn đổi, đề dùng được cho liên kết.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button block={false} onClick={lock} pending={busy ? "Đang khóa..." : undefined}>Xác nhận và khóa</Button>
                <Button variant="secondary" block={false} disabled={busy} onClick={() => setAsk(false)}>Hủy</Button>
              </div>
            </Alert>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button block={false} disabled={!sel.length || rp} onClick={() => setAsk(true)}>Xác nhận đáp án đã chọn ({sel.length} đề)</Button>
              {rp ? <span className="text-sm text-text-muted">Đang cập nhật danh sách...</span> : !sel.length && <span className="text-sm text-text-muted">Chọn ít nhất một đề để xác nhận.</span>}
            </div>
          )}
        </>
      )}
      </div>
    </details>
  );
}
