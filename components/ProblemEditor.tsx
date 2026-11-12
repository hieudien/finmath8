"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AiBadge, AiButton, Alert, Badge, Button, Field, GradeSelect, TextArea, post, toast } from "@/components/ui";
import MathTextArea from "@/components/MathTextArea";
import type { Problem } from "@/lib/schema/problem";
import { answersToLines, linesToAnswers } from "@/lib/answers";
import { useFlyout } from "@/components/Flyout";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const J = (v: unknown) => JSON.stringify(v, null, 2);
const answered = (s: string) => s.trim() !== "" && s.trim() !== "{}"; // ô Đáp án đã có nội dung

export default function ProblemEditor({ initial, newCode, rowId, inPanel = false }: { initial?: Problem; newCode?: string; rowId?: string; inPanel?: boolean }) {
  const router = useRouter();
  const fly = useFlyout(); // có giá trị khi đang mở trong flyout
  const p = initial;
  const [id, setId] = useState(p?.id ?? newCode ?? "BT01");
  const [title, setTitle] = useState(p?.title ?? "");
  const [grade, setGrade] = useState(p && p.grade !== 8 ? String(p.grade) : ""); // lớp khác 8 thì điền sẵn; 8 có thể là mặc định cũ nên bắt chọn lại
  const [topic, setTopic] = useState(p?.topic ?? "");
  const [statement, setStatement] = useState(p?.statement ?? "");
  const [skills, setSkills] = useState((p?.skills ?? []).join(", "));
  const [data, setData] = useState(J(p?.data ?? {}));
  const [solution, setSolution] = useState(answersToLines(p?.solution ?? {})); // mỗi dòng "tên = giá trị"; lưu vẫn là đối tượng
  const [steps, setSteps] = useState((p?.solution_steps ?? []).join("\n"));
  const [errors, setErrors] = useState((p?.common_errors ?? []).join("\n"));
  const [hints, setHints] = useState([1, 2, 3].map((l) => p?.hints.find((h) => h.level === l)?.text ?? ""));
  const [extension, setExtension] = useState(p?.extension ?? "");
  const [built, setBuilt] = useState<Problem | null>(null); // đề AI vừa làm đạt chuẩn: giữ chỉ dẫn từng bước để lưu cùng
  const [objectives, setObjectives] = useState(p?.learning_objectives ?? []);
  const [ok, setOk] = useState(!!p?.answer_locked); // đề đang khóa: giữ khóa khi lưu, trừ khi sửa đáp án (tự bỏ tick)
  const [busy, setBusy] = useState("");
  const [reading, setReading] = useState(false);
  const [locked, setLocked] = useState(!!p?.answer_locked); // đáp án đang khóa: ô Đáp án chỉ đọc tới khi bấm Mở khóa
  const [unlocking, setUnlocking] = useState(false);

  async function unlock() {
    setUnlocking(true);
    const { ok: good, data: r } = await post<{ error?: string }>("/api/problems", { action: "unlock_answer", id: rowId });
    setUnlocking(false);
    if (!good) return toast("danger", r.error ?? "Không mở khóa được.");
    setLocked(false); setOk(false);
    toast("success", "Đã mở khóa đáp án. Sửa xong thì tick xác nhận và bấm Lưu đề để khóa lại.");
  }

  // Điền các ô theo đề AI vừa làm (chưa lưu). AI có thể giải sai: giáo viên phải tự kiểm tra và tick xác nhận đáp án.
  function fill(g: Problem) {
    setBuilt(g); setLocked(false); fly?.markDirty(true); // AI điền lại thì đáp án chưa được xác nhận nữa
    setSkills(g.skills.join(", ")); setData(J(g.data)); setSolution(answersToLines(g.solution)); setSteps(g.solution_steps.join("\n"));
    setErrors(g.common_errors.join("\n")); setHints([1, 2, 3].map((l) => g.hints.find((h) => h.level === l)?.text ?? ""));
    setExtension(g.extension); setObjectives(g.learning_objectives);
    if (!title.trim()) setTitle(g.title);
    if (!topic.trim()) setTopic(g.topic);
    setOk(false);
  }

  // Một nút AI: có đáp án thì giữ đáp án (không cần lớp), AI viết lại lời giải, gợi ý...; chưa có thì AI giải rồi chuẩn hóa (cần lớp).
  // o: nội dung vừa nhận từ ảnh, chưa kịp vào state.
  async function run(o: { statement?: string; solution?: string } = {}) {
    const st = (o.statement ?? statement).trim();
    if (answered(o.solution ?? solution)) {
      const d = draft(o);
      if (!d) return;
      setBusy("AI đang viết lại lời giải theo đáp án đã có...");
      // Chưa chọn lớp: gửi lớp 12 (không giới hạn kiến thức) chỉ để gọi AI; ô Lớp không đổi và Lưu đề vẫn bắt chọn lớp.
      const { ok: good, data: r } = await post<{ problem: Problem }>("/api/problems", { action: "standardize_draft", problem: { ...d, grade: Number(grade) || 12 } });
      setBusy("");
      if (!good) return toast("danger", r.error ?? "AI chưa chuẩn hóa được. Thử lại.");
      fill(r.problem);
      return toast("success", "AI đã viết lại theo đáp án đã có (đáp án giữ nguyên). Kiểm tra, tick xác nhận rồi bấm Lưu đề.");
    }
    setBusy("AI đang giải đề...");
    const text = `Tiêu đề: ${title}\nLớp: ${grade}\nChủ đề: ${topic}\nĐề bài: ${st}`;
    const { ok: good, data: d } = await post<{ problem: Problem }>("/api/problems", { action: "normalize", text, grade: Number(grade) });
    if (!good) { setBusy(""); return toast("danger", d.error ?? "AI chưa tạo được. Thử lại."); }
    setBusy("AI đang kiểm tra đáp án và viết chỉ dẫn...");
    const { ok: done, data: c } = await post<{ problem: Problem }>("/api/problems", { action: "complete", problem: { ...d.problem, grade: Number(grade) } });
    setBusy("");
    if (!done) return toast("danger", c.error ?? "AI chưa làm đề này đạt chuẩn. Thử lại.");
    fill(c.problem);
    toast("success", "AI đã giải và điền xong. Hãy tự kiểm tra đáp án, tick xác nhận rồi bấm Lưu đề.");
  }

  // Thu ảnh về cạnh dài 1600px, JPEG: nhẹ hơn, đỡ tốn token.
  async function readImage(file: File) {
    let next: (() => Promise<unknown>) | undefined;
    setReading(true);
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      const { ok: good, data: d } = await post<{ statement: string; solution: Record<string, unknown>; solution_steps: string[]; warnings?: string[] }>("/api/problems", { action: "read_image", image: c.toDataURL("image/jpeg", 0.85) });
      if (!good) return toast("danger", d.error ?? "AI chưa đọc được ảnh. Thử lại.");
      // Kiểm tự động thấy chỗ có thể sai (công thức vỡ, hệ thiếu dấu ngăn hàng...): nhắc đối chiếu với ảnh gốc.
      if (d.warnings?.length) toast("warning", `Đã đọc ảnh nhưng có chỗ có thể sai: ${d.warnings.slice(0, 2).join(" ")} Hãy đối chiếu đề với ảnh gốc.`);
      const st = (statement.trim() ? statement.trim() + "\n" : "") + d.statement;
      setStatement(st);
      // Đáp án trong ảnh chỉ điền khi ô Đáp án còn trống, không ghi đè cái giáo viên đã nhập.
      const hasAns = Object.keys(d.solution ?? {}).length > 0;
      const sol = hasAns && !answered(solution) ? answersToLines(d.solution) : solution;
      if (sol !== solution) { setSolution(sol); setOk(false); }
      if (!answered(sol) && !grade) { // AI phải tự giải mà chưa có lớp: để lời giải trong ảnh cho giáo viên xem, hộp lý do bên dưới chỉ cách làm tiếp
        if (d.solution_steps.length && !steps.trim()) setSteps(d.solution_steps.join("\n"));
        return toast("success", "Đã đọc đề từ ảnh. Ảnh chưa có đáp án nên AI phải tự giải: chọn Lớp rồi bấm nút AI.");
      }
      next = () => run({ statement: st, solution: sol });
    } catch { toast("danger", "Không mở được ảnh này."); }
    finally { setReading(false); }
    await next?.(); // AI giải và chuẩn hóa luôn (có đáp án trong ảnh thì giữ đáp án đó)
  }

  // Đề đang soạn theo nội dung các ô; null (đã báo lỗi) khi dữ kiện hoặc đáp án sai JSON.
  // o: nội dung vừa nhận từ ảnh, chưa kịp vào state.
  function draft(o: { statement?: string; solution?: string } = {}) {
    let d: unknown;
    try { d = JSON.parse(data || "{}"); } catch { toast("danger", "Dữ kiện sai cú pháp JSON."); return null; }
    const ans = linesToAnswers(o.solution ?? solution);
    if (!ans.ok) { toast("danger", `Đáp án: ${ans.error}`); return null; }
    const s = ans.value;
    return {
      ...(built ?? p ?? {}), id, title: title.trim() || "Đề từ ảnh", grade: Number(grade), topic: topic.trim(), skills: skills.split(",").map((x) => x.trim()).filter(Boolean),
      statement: (o.statement ?? statement).trim(), learning_objectives: objectives, data: d, solution: s, solution_steps: lines(steps), common_errors: lines(errors),
      hints: hints.map((text, i) => ({ level: i + 1, text: text.trim() })), extension: extension.trim(), reviewed: true,
      check_note: "", // giáo viên đã duyệt: bỏ cảnh báo kiểm chéo (bấm Kiểm tra đáp án để chạy lại)
      // Sửa lời giải thì kết quả chuẩn và lỗi gắn theo số bước cũ không còn đúng: bỏ để AI tạo lại cùng chỉ dẫn.
      ...(lines(steps).join("\n") !== (built ?? p)?.solution_steps.join("\n") && { step_checks: [], error_traps: [], step_formats: [], step_examples: [], step_subs: [], step_analog: [] }),
    };
  }

  async function save() {
    const d = draft();
    if (!d) return;
    const problem = { ...d, answer_locked: ok }; // khóa đáp án đúng khi giáo viên tick xác nhận
    setBusy("Đang lưu...");
    if (p && rowId && problem.id !== p.id) {
      const code = problem.id.trim().toUpperCase();
      const { ok: renamed, data: e } = await post("/api/problems", { action: "rename", id: rowId, code });
      if (!renamed) { setBusy(""); return toast("danger", e.error ?? "Không đổi được mã đề."); }
      problem.id = code;
    }
    const { ok: good, data: r } = await post("/api/problems", { action: "save", problems: [problem] });
    if (!good) { setBusy(""); return toast("danger", r.error ?? "Không lưu được."); }
    if (fly) { fly.close(); setTimeout(() => router.refresh(), 300); return; } // trong flyout: lùi về danh sách, đợi lùi xong mới làm mới để danh sách không hiện dữ liệu cũ
    router.push("/dashboard/problems"); router.refresh();
  }

  // Lý do từng nút chưa bấm được, hiện ngay dưới nút để giáo viên biết phải làm gì.
  const aiWhy = [
    statement.trim().length < 10 && `Đề bài mới có ${statement.trim().length}/10 ký tự tối thiểu: nhập đề bài hoặc dán ảnh đề vào ô Đề bài.`,
    !answered(solution) && !grade && "Ô Đáp án đang trống nên AI phải tự giải, và việc này cần biết lớp: chọn Lớp ở trên. Hoặc tự nhập đáp án vào ô Đáp án, khi đó không cần chọn lớp.",
  ].filter(Boolean) as string[];
  const saveWhy = [
    !id.trim() && "Chưa có mã đề.",
    !grade && "Chưa chọn Lớp.",
    !title.trim() && "Chưa có tiêu đề.",
    !statement.trim() && "Chưa có đề bài.",
    !steps.trim() && "Chưa có lời giải từng bước (bấm nút AI hoặc tự nhập).",
    hints.some((h) => !h.trim()) && `Thiếu gợi ý mức ${hints.map((h, i) => (h.trim() ? 0 : i + 1)).filter(Boolean).join(", ")}.`,
    !ok && "Chưa tick ô xác nhận đáp án ở ngay phía trên nút Lưu đề.",
  ].filter(Boolean) as string[];
  const Why = ({ title: t, items }: { title: string; items: string[] }) => items.length > 0 && (
    <Alert tone="warning"><span className="font-medium">{t}</span><ul className="mt-1 list-disc pl-5">{items.map((x) => <li key={x}>{x}</li>)}</ul></Alert>
  );
  return (
    <div className="flex max-w-3xl flex-col gap-4" onInput={() => fly?.markDirty(true)}>
      {reading && <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="rounded-sm bg-surface px-6 py-4 text-lg font-medium text-text">AI đang đọc ảnh, đợi vài giây...</div></div>}
      {!inPanel && <Link href="/dashboard/problems" className="inline-flex min-h-11 items-center text-sm text-primary underline">Về danh sách đề</Link>}
      {/* Thanh cố định khi cuộn: tiêu đề, trạng thái khóa, nút AI. Trên điện thoại nằm dưới thanh menu (cao 61px). */}
      <div className={`sticky z-10 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface px-4 py-2 ${inPanel ? "-top-4" : "top-[61px] md:top-0"}`}>
        <h1 className="flex flex-wrap items-center gap-2 text-xl">{p ? `Sửa đề ${id}` : "Tạo đề mới"} {p && <Badge tone={locked ? "success" : "warn"}>{locked ? "Đáp án đã khóa" : "Chưa xác nhận đáp án"}</Badge>}</h1>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {p && rowId && locked && <Button variant="ghost" block={false} onClick={unlock} pending={unlocking ? "Đang mở khóa..." : undefined}>Mở khóa</Button>}
          <AiButton variant="secondary" block={false} onClick={() => run()} disabled={aiWhy.length > 0} pending={busy || undefined}>AI giải và chuẩn hóa</AiButton>
        </div>
      </div>
      {!locked && <Alert tone="warning">AI có thể giải sai. Hãy tự giải đề, sửa ô Đáp án nếu cần, bấm &quot;AI giải và chuẩn hóa&quot; để AI viết lại lời giải theo đáp án đúng, rồi tick xác nhận để khóa đáp án khi lưu.</Alert>}
      {p && rowId && <Field label="Mã đề" value={id} onChange={(e) => setId(e.target.value.toUpperCase())} maxLength={20} hint="Đổi mã thì liên kết và thống kê cũ của đề này cũng đổi theo." />}
      <Field label="Tiêu đề" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      <div className="grid gap-4 sm:grid-cols-2">
        <GradeSelect value={grade} onChange={setGrade} hint={p && p.grade === 8 ? "Đề này đang là lớp 8 (có thể là mặc định cũ). Chọn lại để xác nhận lớp." : undefined} />
        <Field label="Chủ đề" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ví dụ: Giải phương trình bậc nhất" />
      </div>
      <div onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); readImage(f); } }}>
        <MathTextArea label="Đề bài (học sinh sẽ thấy)" rows={5} value={statement} onChange={setStatement} hint="Bấm Công thức để soạn công thức, hoặc gõ trong $...$. Sửa đề bài xong thì bấm lại nút AI để cập nhật lời giải. Dán ảnh đề (Ctrl+V) vào ô này: AI tách đề bài vào ô này, đáp án và cách giải (nếu ảnh có) vào các ô bên dưới." />
      </div>
      <label className="inline-flex min-h-11 w-fit cursor-pointer items-center text-sm text-primary underline">Hoặc chọn ảnh đề từ máy&nbsp;<AiBadge /><input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readImage(f); }} /></label>
      <p className="text-sm text-text-muted">Ô Đáp án đã có thì AI giữ đáp án và viết lại lời giải, gợi ý. Ô Đáp án trống thì AI tự giải. Muốn AI giải lại từ đầu: xóa hết ô Đáp án (để trống) rồi bấm nút.</p>
      <Why title="Chưa bấm được nút AI vì:" items={aiWhy} />

      <Field label="Kỹ năng (cách nhau dấu phẩy)" value={skills} onChange={(e) => setSkills(e.target.value)} hint="Dùng để thống kê học sinh yếu kỹ năng nào." />
      <TextArea label="Đáp án (mỗi dòng một đáp án: tên = giá trị)" rows={4} value={solution} readOnly={locked} onChange={(e) => { setSolution(e.target.value); setOk(false); }} className="font-mono text-sm" hint="Ví dụ x = 3. Đề nhiều ý thì thêm tiền tố ý: a_x = 2, b_m = -6. Phân số như 14/3 được đổi thành số thập phân. Chatbot không bao giờ nói ra các số trong đáp án." />
      <MathTextArea label="Lời giải từng bước (mỗi dòng một bước)" rows={6} value={steps} onChange={setSteps} />
      {hints.map((h, i) => <MathTextArea key={i} label={`Gợi ý mức ${i + 1}`} rows={2} value={h} onChange={(v) => setHints((a) => a.map((x, j) => (j === i ? v : x)))} />)}
      <MathTextArea label="Sai lầm thường gặp (mỗi dòng một ý)" rows={3} value={errors} onChange={setErrors} />
      <details className="rounded-sm border border-border px-3 py-2">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">Nâng cao</summary>
        <div className="flex flex-col gap-4 pb-2">
          <TextArea label="Dữ kiện (JSON)" rows={3} value={data} onChange={(e) => setData(e.target.value)} className="font-mono text-sm" />
          <MathTextArea label="Câu hỏi mở rộng" rows={2} value={extension} onChange={setExtension} />
        </div>
      </details>

      <label className="flex min-h-11 items-start gap-2"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1 size-5" /><span>Tôi đã tự kiểm tra và xác nhận đáp án, lời giải là đúng (đáp án sẽ được khóa khi lưu).</span></label>
      <Why title="Chưa bấm được Lưu đề vì:" items={saveWhy} />
      <div><Button onClick={save} disabled={saveWhy.length > 0} pending={busy || undefined}>Lưu đề</Button></div>
    </div>
  );
}
