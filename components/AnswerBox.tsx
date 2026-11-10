"use client";
import { useState } from "react";
import { Alert, Badge, Button, TextArea, post, toast, useRefresh } from "@/components/ui";

// Khung xác nhận đáp án ở trang đề: AI có thể giải sai nên chỉ đáp án giáo viên đã khóa mới được chuẩn hóa giữ nguyên và đưa vào liên kết.
export function AnswerBox({ id, solution, locked, check }: { id: string; solution: Record<string, unknown>; locked: boolean; check: "pass" | "fail" | "skip" }) {
  const [rp, refresh] = useRefresh();
  const [busy, setBusy] = useState("");
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(JSON.stringify(solution, null, 1));

  async function run(label: string, body: object, done: string) {
    setBusy(label);
    const { ok, data } = await post<{ error?: string }>("/api/problems", { id, ...body });
    setBusy("");
    if (!ok) return toast("danger", data.error ?? "Có lỗi.");
    setEdit(false); toast("success", done); refresh();
  }
  async function saveEdited() {
    let s: unknown;
    try { s = JSON.parse(text); } catch { return toast("danger", 'Đáp án sai cú pháp JSON, ví dụ {"x": 3}.'); }
    if (!s || typeof s !== "object" || Array.isArray(s) || !Object.keys(s).length) return toast("danger", 'Đáp án phải là một đối tượng JSON không rỗng, ví dụ {"x": 3}.');
    await run("save", { action: "set_answer", solution: s }, "Đã lưu và khóa đáp án. Bấm Chuẩn hóa đề để AI viết lại lời giải theo đáp án này.");
  }
  const wait = busy ? "Đang lưu..." : rp ? "Đang cập nhật..." : undefined;

  if (locked) return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <Badge tone="success">Đáp án đã khóa</Badge>
      <span className="text-sm text-text-muted">Chuẩn hóa chỉ viết lại lời giải theo đáp án này, không đổi đáp án.</span>
      <Button variant="ghost" block={false} onClick={() => run("unlock", { action: "unlock_answer" }, "Đã mở khóa đáp án.")} pending={wait}>Mở khóa để sửa</Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 print:hidden">
      <Alert tone="warning">
        <p className="font-medium">Chưa xác nhận đáp án: thầy/cô cần tự giải và kiểm tra trước khi dùng.</p>
        <p>AI có thể giải sai, nên đề này chưa thêm được vào liên kết cho học sinh. Đáp án hiện có: <code className="font-mono">{JSON.stringify(solution)}</code>
          {check === "pass" && " (đã khớp khi thay vào đề, nhưng vẫn cần thầy/cô xác nhận)"}
          {check === "fail" && " (KHÔNG thỏa đề khi thay vào: nhiều khả năng sai)"}.
        </p>
      </Alert>
      {edit ? (
        <>
          <TextArea label="Đáp án đúng (JSON)" rows={4} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-sm" hint='Ví dụ {"x": 3} hoặc {"x": -1, "y": 2}. Lưu xong, lời giải cũ sẽ bị xóa: bấm Chuẩn hóa đề để AI viết lại theo đáp án này.' />
          <div className="flex flex-wrap gap-2">
            <Button block={false} onClick={saveEdited} pending={wait}>Lưu và khóa đáp án</Button>
            <Button variant="secondary" block={false} onClick={() => setEdit(false)}>Hủy</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button block={false} onClick={() => run("lock", { action: "lock_answer" }, "Đã khóa đáp án.")} pending={wait}>Đáp án đúng, khóa lại</Button>
          <Button variant="secondary" block={false} onClick={() => setEdit(true)}>Sửa đáp án</Button>
        </div>
      )}
    </div>
  );
}
