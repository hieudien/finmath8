"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, TextArea, post } from "@/components/ui";
import MathTextArea from "@/components/MathTextArea";
import type { Problem } from "@/lib/schema/problem";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const J = (v: unknown) => JSON.stringify(v, null, 2);

export default function ProblemEditor({ initial, newCode }: { initial?: Problem; newCode?: string }) {
  const router = useRouter();
  const p = initial;
  const [id] = useState(p?.id ?? newCode ?? "BT01");
  const [title, setTitle] = useState(p?.title ?? "");
  const [grade, setGrade] = useState(String(p?.grade ?? 8));
  const [topic, setTopic] = useState(p?.topic ?? "");
  const [statement, setStatement] = useState(p?.statement ?? "");
  const [skills, setSkills] = useState((p?.skills ?? []).join(", "));
  const [data, setData] = useState(J(p?.data ?? {}));
  const [solution, setSolution] = useState(J(p?.solution ?? {}));
  const [steps, setSteps] = useState((p?.solution_steps ?? []).join("\n"));
  const [errors, setErrors] = useState((p?.common_errors ?? []).join("\n"));
  const [hints, setHints] = useState([1, 2, 3].map((l) => p?.hints.find((h) => h.level === l)?.text ?? ""));
  const [extension, setExtension] = useState(p?.extension ?? "");
  const [greeting, setGreeting] = useState(p?.greeting ?? "");
  const [objectives, setObjectives] = useState(p?.learning_objectives ?? []);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState("");
  const [reading, setReading] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(p?.reviewed === false ? { tone: "warning", text: "AI vừa tạo đề này. Kiểm tra đáp án, lời giải rồi tick xác nhận để lưu." } : null);

  async function generate() {
    setBusy("AI đang tạo..."); setMsg(null);
    const text = `Tiêu đề: ${title}\nLớp: ${grade}\nChủ đề: ${topic}\nĐề bài: ${statement}`;
    const { ok: good, data: d } = await post<{ problem: Problem }>("/api/problems", { action: "normalize", text });
    setBusy("");
    if (!good) return setMsg({ tone: "danger", text: d.error ?? "AI chưa tạo được. Thử lại." });
    const g = d.problem;
    setSkills(g.skills.join(", ")); setData(J(g.data)); setSolution(J(g.solution)); setSteps(g.solution_steps.join("\n"));
    setErrors(g.common_errors.join("\n")); setHints([1, 2, 3].map((l) => g.hints.find((h) => h.level === l)?.text ?? ""));
    setExtension(g.extension); setGreeting(g.greeting); setObjectives(g.learning_objectives);
    if (!title) setTitle(g.title);
    if (!topic) setTopic(g.topic);
    setOk(false);
    setMsg({ tone: "warning", text: "AI đã điền các phần còn lại. Hãy kiểm tra kỹ đáp án, lời giải, gợi ý, sửa nếu cần rồi lưu." });
  }

  // Thu ảnh về cạnh dài 1600px, JPEG: nhẹ hơn, đỡ tốn token.
  async function readImage(file: File) {
    setReading(true); setMsg(null);
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      const { ok: good, data: d } = await post<{ statement: string }>("/api/problems", { action: "read_image", image: c.toDataURL("image/jpeg", 0.85) });
      if (!good) return setMsg({ tone: "danger", text: d.error ?? "AI chưa đọc được ảnh. Thử lại." });
      setStatement((s) => (s.trim() ? s.trim() + "\n" : "") + d.statement);
      setMsg({ tone: "warning", text: "AI đã đọc ảnh. Kiểm tra lại đề bài và công thức rồi bấm nút AI tạo đáp án." });
    } catch { setMsg({ tone: "danger", text: "Không mở được ảnh này." }); }
    finally { setReading(false); }
  }

  async function save() {
    let d: unknown, s: unknown;
    try { d = JSON.parse(data || "{}"); } catch { return setMsg({ tone: "danger", text: "Dữ kiện sai cú pháp JSON." }); }
    try { s = JSON.parse(solution); } catch { return setMsg({ tone: "danger", text: 'Đáp án sai cú pháp JSON, ví dụ {"x": 3}.' }); }
    const problem = {
      ...(p ?? {}), id, title: title.trim(), grade: Number(grade) || 8, topic: topic.trim(), skills: skills.split(",").map((x) => x.trim()).filter(Boolean),
      statement: statement.trim(), learning_objectives: objectives, data: d, solution: s, solution_steps: lines(steps), common_errors: lines(errors),
      hints: hints.map((text, i) => ({ level: i + 1, text: text.trim() })), extension: extension.trim(), greeting: greeting.trim(), reviewed: true,
    };
    setBusy("Đang lưu..."); setMsg(null);
    const { ok: good, data: r } = await post("/api/problems", { action: "save", problems: [problem] });
    setBusy("");
    if (!good) return setMsg({ tone: "danger", text: r.error ?? "Không lưu được." });
    router.push("/dashboard/problems"); router.refresh();
  }

  const canGen = statement.trim().length >= 10;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {reading && <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="rounded-sm bg-surface px-6 py-4 text-lg font-medium text-text">AI đang đọc ảnh, đợi vài giây...</div></div>}
      <Link href="/dashboard/problems" className="inline-flex min-h-11 items-center text-sm text-primary underline">Về danh sách đề</Link>
      <h1>{p ? `Sửa đề ${id}` : "Tạo đề mới"}</h1>
      <Field label="Tiêu đề" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lớp" type="number" min={1} max={12} value={grade} onChange={(e) => setGrade(e.target.value)} />
        <Field label="Chủ đề" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ví dụ: Giải phương trình bậc nhất" />
      </div>
      <div onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); readImage(f); } }}>
        <MathTextArea label="Đề bài (học sinh sẽ thấy)" rows={5} value={statement} onChange={setStatement} hint="Bấm Công thức để soạn công thức, hoặc gõ trong $...$. Sửa đề bài xong thì bấm lại nút AI để cập nhật lời giải. Dán ảnh đề (Ctrl+V) vào ô này để AI đọc." />
      </div>
      <label className="inline-flex min-h-11 w-fit cursor-pointer items-center text-sm text-primary underline">Hoặc chọn ảnh đề từ máy<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readImage(f); }} /></label>
      <div><Button variant="secondary" onClick={generate} disabled={!canGen} pending={busy || undefined}>AI tạo đáp án, lời giải, gợi ý từ đề bài</Button></div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <Field label="Kỹ năng (cách nhau dấu phẩy)" value={skills} onChange={(e) => setSkills(e.target.value)} hint="Dùng để thống kê học sinh yếu kỹ năng nào." />
      <TextArea label="Đáp án (JSON)" rows={3} value={solution} onChange={(e) => setSolution(e.target.value)} className="font-mono text-sm" hint='Ví dụ {"x": 3}. Chatbot không bao giờ nói ra các số trong đáp án.' />
      <MathTextArea label="Lời giải từng bước (mỗi dòng một bước)" rows={6} value={steps} onChange={setSteps} />
      {hints.map((h, i) => <MathTextArea key={i} label={`Gợi ý mức ${i + 1}`} rows={2} value={h} onChange={(v) => setHints((a) => a.map((x, j) => (j === i ? v : x)))} />)}
      <MathTextArea label="Sai lầm thường gặp (mỗi dòng một ý)" rows={3} value={errors} onChange={setErrors} />
      <details className="rounded-sm border border-border px-3 py-2">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">Nâng cao</summary>
        <div className="flex flex-col gap-4 pb-2">
          <TextArea label="Dữ kiện (JSON)" rows={3} value={data} onChange={(e) => setData(e.target.value)} className="font-mono text-sm" />
          <TextArea label="Lời chào đầu tiên" rows={2} value={greeting} onChange={(e) => setGreeting(e.target.value)} />
          <MathTextArea label="Câu hỏi mở rộng" rows={2} value={extension} onChange={setExtension} />
        </div>
      </details>

      <label className="flex min-h-11 items-start gap-2"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1 size-5" /><span>Tôi đã kiểm tra đáp án và lời giải là đúng.</span></label>
      <div><Button onClick={save} disabled={!ok || !title.trim() || !statement.trim() || hints.some((h) => !h.trim()) || !steps.trim()} pending={busy || undefined}>Lưu đề</Button></div>
    </div>
  );
}
