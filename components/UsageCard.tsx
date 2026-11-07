"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, post } from "@/components/ui";

type Props = { calls: number; inTok: number; outTok: number; throttled: number; hitAt: string | null; byModel: [string, number][]; limit: number; learned: number; resetAt: string };

const num = (n: number) => n.toLocaleString("vi-VN");

export default function UsageCard({ calls, inTok, outTok, throttled, hitAt, byModel, limit: manual, learned, resetAt }: Props) {
  const limit = manual || learned; // chưa nhập tay thì dùng mức nhà cung cấp báo ở lần chạm giới hạn gần nhất
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(String(manual || ""));
  const [err, setErr] = useState("");
  const pct = limit ? Math.min(100, Math.round((calls / limit) * 100)) : 0;
  const tone = pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-warning" : "bg-primary";

  async function save() {
    setErr("");
    const { ok, data } = await post("/api/usage", { limit: Number(val || 0) });
    if (!ok) return setErr(data.error ?? "Có lỗi.");
    setEdit(false); router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-labelledby="usage">
      <h2 id="usage">Lượt gọi AI hôm nay</h2>
      {hitAt && <Alert tone="warning">AI đã chạm giới hạn lúc {new Date(hitAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })} hôm nay. Chatbot tự đổi sang model khác; nếu mọi model đều hết, học sinh sẽ thấy thông báo AI chạm giới hạn.</Alert>}
      {limit > 0 ? (
        <div className="flex flex-col gap-1">
          <p><span className="tnum text-2xl font-bold">{pct}%</span> đã dùng · <span className="tnum">{num(calls)}</span>/<span className="tnum">{num(limit)}</span> lượt · còn <span className="tnum font-medium">{num(Math.max(0, limit - calls))}</span> lượt{manual ? "" : " (hạn mức do nhà cung cấp báo khi chạm giới hạn)"}</p>
          <div className="h-3 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Phần trăm hạn mức đã dùng">
            <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <p><span className="tnum text-2xl font-bold">{num(calls)}</span> lượt đã gọi. Chưa biết hạn mức của key. Khi AI chạm giới hạn lần đầu, ứng dụng tự đọc hạn mức nhà cung cấp báo; bạn cũng có thể nhập tay.</p>
      )}
      <p className="text-sm text-text-muted tnum">Token vào {num(inTok)} · Token ra {num(outTok)}{throttled > 0 ? ` · ${throttled} lần model báo hết lượt, đã tự đổi model` : ""}</p>
      {byModel.length > 0 && <p className="text-sm text-text-muted">{byModel.map(([m, n]) => `${m}: ${num(n)} lượt`).join(" · ")}</p>}
      <p className="text-sm text-text-muted">Đây là ước tính theo số lượt gọi qua ứng dụng này. Nhà cung cấp AI không cho đọc hạn mức còn lại, nên số liệu thật xem ở Google AI Studio hoặc OpenAI Platform. Bộ đếm đặt lại lúc {resetAt} (Gemini tính theo giờ Pacific).</p>
      {edit ? (
        <div className="flex flex-col gap-2">
          <Field label="Hạn mức lượt gọi mỗi ngày" type="number" inputMode="numeric" min={0} value={val} onChange={(e) => setVal(e.target.value)} hint="Xem số này ở trang giới hạn (rate limits) của key. 0 là bỏ phần trăm." />
          {err && <Alert tone="danger">{err}</Alert>}
          <div className="flex gap-2"><Button onClick={save}>Lưu</Button><Button variant="secondary" onClick={() => setEdit(false)}>Hủy</Button></div>
        </div>
      ) : <Button variant="secondary" onClick={() => setEdit(true)} className="self-start">{limit ? "Đổi hạn mức" : "Nhập hạn mức"}</Button>}
    </section>
  );
}
