"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Confirm, TextArea, post } from "@/components/ui";

type Msg = { tone: "success" | "danger"; text: string } | null;

export function ImportPanel() {
  const router = useRouter();
  const [tab, setTab] = useState<"json" | "text">("json");
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const file = useRef<HTMLInputElement>(null);

  const done = (n: number) => { setMsg({ tone: "success", text: `Đã lưu ${n} đề.` }); setRaw(""); setPreview(""); router.refresh(); };
  const fail = (t?: string) => setMsg({ tone: "danger", text: t ?? "Có lỗi." });

  async function saveJson() {
    setBusy("Đang lưu..."); setMsg(null);
    const { ok, data } = await post<{ saved: number }>("/api/problems", { action: "import_json", raw });
    setBusy("");
    if (ok) done(data.saved); else fail(data.error);
  }
  async function normalize() {
    setBusy("Đang chuẩn hóa..."); setMsg(null);
    const { ok, data } = await post<{ problem: unknown }>("/api/problems", { action: "normalize", text: raw });
    setBusy("");
    if (ok) setPreview(JSON.stringify(data.problem, null, 2)); else fail(data.error);
  }
  async function savePreview() {
    let obj: unknown;
    try { obj = JSON.parse(preview); } catch { return fail("JSON xem trước sai cú pháp."); }
    setBusy("Đang lưu..."); setMsg(null);
    const { ok, data } = await post<{ saved: number }>("/api/problems", { action: "save", problems: [obj] });
    setBusy("");
    if (ok) done(data.saved); else fail(data.error);
  }
  async function seed() {
    setBusy("Đang thêm..."); setMsg(null);
    const { ok, data } = await post<{ saved: number }>("/api/problems", { action: "seed" });
    setBusy("");
    if (ok) done(data.saved); else fail(data.error);
  }

  const tabCls = (t: string) => `min-h-11 flex-1 border-b-2 px-3 font-medium ${tab === t ? "border-primary text-primary" : "border-transparent text-text-muted"}`;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 md:p-6" aria-labelledby="imp">
      <h2 id="imp">Nạp đề mới</h2>
      <div role="tablist" className="flex border-b border-border">
        <button role="tab" aria-selected={tab === "json"} className={tabCls("json")} onClick={() => { setTab("json"); setPreview(""); }}>JSON</button>
        <button role="tab" aria-selected={tab === "text"} className={tabCls("text")} onClick={() => { setTab("text"); setPreview(""); }}>Văn bản</button>
      </div>

      {!preview && (
        <>
          <TextArea label={tab === "json" ? "Nội dung JSON (một đề hoặc mảng nhiều đề)" : "Dán đề bài dạng văn bản"} rows={8} value={raw} onChange={(e) => setRaw(e.target.value)}
            hint={tab === "json" ? "Cần: id, title, solution, hints (3 mức). Có thể thêm statement là đề bài hiển thị cho học sinh." : "Chatbot sẽ chuẩn hóa thành JSON. Em xem lại trước khi lưu."} />
          <div className="flex flex-col gap-2 sm:flex-row">
            {tab === "json" ? (
              <>
                <Button onClick={saveJson} disabled={raw.trim().length < 2} pending={busy || undefined}>Kiểm tra và lưu</Button>
                <input ref={file} type="file" accept=".json,application/json" className="sr-only" aria-label="Chọn tệp JSON" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setRaw(await f.text()); }} />
                <Button variant="secondary" onClick={() => file.current?.click()}>Chọn tệp .json</Button>
              </>
            ) : (
              <Button onClick={normalize} disabled={raw.trim().length < 20} pending={busy || undefined}>Chuẩn hóa thành JSON</Button>
            )}
          </div>
        </>
      )}

      {preview && (
        <>
          <Alert tone="warning">Kiểm tra kỹ đáp án (solution) và gợi ý trước khi lưu. AI có thể tính sai.</Alert>
          <TextArea label="JSON đã chuẩn hóa (sửa được)" rows={16} value={preview} onChange={(e) => setPreview(e.target.value)} className="font-mono text-sm" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={savePreview} pending={busy || undefined}>Lưu đề</Button>
            <Button variant="secondary" onClick={() => setPreview("")}>Quay lại</Button>
          </div>
        </>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="border-t border-border pt-4">
        <p className="mb-2 text-sm text-text-muted">Tài khoản mới đã có sẵn 10 đề mẫu (TC01–TC10). Lỡ xóa nhầm thì bấm đây để thêm lại, đề đã có sẽ được giữ nguyên.</p>
        <Button variant="secondary" onClick={seed} pending={busy || undefined}>Thêm đề mẫu</Button>
      </div>
    </section>
  );
}

type TR = { name: string; pass: boolean; detail: string };

export function ProblemActions({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<TR[] | null>(null);
  const [err, setErr] = useState("");

  async function run() {
    setBusy(true); setErr(""); setRes(null);
    const { ok, data } = await post<{ results: TR[] }>("/api/problems", { action: "selftest", id });
    setBusy(false);
    if (ok) setRes(data.results); else setErr(data.error ?? "Có lỗi.");
  }

  const passed = res?.filter((r) => r.pass).length ?? 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/dashboard/problems/${id}`} className="inline-flex min-h-11 items-center justify-center rounded-sm bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover">Xem đề</Link>
        <Button variant="secondary" onClick={run} pending={busy ? "Đang kiểm thử (khoảng 30 giây)..." : undefined}>Kiểm thử chatbot</Button>
        <Confirm label={`Xóa ${code}`} message="Đề sẽ bị xóa khỏi danh sách. Liên kết đã tạo vẫn dùng bản chụp đề cũ." onConfirm={async () => { await post("/api/problems", { action: "delete", id }); router.refresh(); }} />
      </div>
      <div className="basis-full" aria-live="polite">
        {err && <Alert tone="danger">{err}</Alert>}
        {res && (
          <div className="mt-2 flex flex-col gap-2">
            <Alert tone={passed === res.length ? "success" : "warning"}>Đạt {passed}/{res.length} kiểm tra.</Alert>
            <ul className="divide-y divide-border rounded-sm border border-border">
              {res.map((r) => (
                <li key={r.name} className="px-3 py-2 text-sm">
                  <p className="font-medium"><span className={r.pass ? "text-success" : "text-danger"}>{r.pass ? "Đạt" : "Không đạt"}</span> · {r.name}</p>
                  <p className="break-anywhere text-text-muted">{r.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
