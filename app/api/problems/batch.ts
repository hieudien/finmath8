import { check } from "@/lib/db";
import { admin } from "@/lib/supabase/admin";
import { bad } from "@/lib/auth";
import { askJson } from "@/lib/llm";
import { llmCfg } from "@/lib/teacher";
import { problemSchema, type Problem } from "@/lib/schema/problem";
import { log } from "@/lib/log";
import { reportError } from "@/lib/errors";
import { referenceNote, standardizeProblem } from "@/lib/fill";
import { PAR, BUDGET_MS, freeCode, pool } from "@/lib/batch";
import { gradeRule } from "@/lib/grade";
import { taxonomyRule } from "@/lib/taxonomy";
import { walk } from "@/lib/latex-fix";
import { readExamItems } from "@/lib/read-multi";
import { holdAnswer, releaseAnswer, summary, viewOf, type BatchItem, type BatchStatus } from "@/lib/import-batch";
import type { Body } from "./schema";
import { NO_KEY, type Ctx } from "./ctx";
import { NORMALIZE_SYSTEM } from "./normalize-prompt";
import { save } from "./store";

export async function batchActions(b: Body, c: Ctx): Promise<Response | undefined> {
  const { u } = c;
  // Đọc một ảnh hoặc một đoạn chữ thành nhiều đề (chưa lưu gì): trả cho giáo viên xem trước, sửa, xác nhận đáp số rồi mới tạo đợt.
  if (b.action === "read_items") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    let image: { mime: string; b64: string } | undefined;
    if (b.image) { const [head, b64] = b.image.split(","); image = { mime: head.slice(5, head.indexOf(";")), b64 }; }
    const r = await readExamItems(cfg, { image, text: b.text });
    await log({ actor: "teacher", action: "import_read", teacherId: u.id, meta: { items: r.items.length, attempts: r.attempts, answers: r.items.filter((i) => Object.keys(i.solution).length).length, warnings: r.items.reduce((n, i) => n + i.warnings.length, 0) } });
    return Response.json({ ok: true, items: r.items, attempts: r.attempts });
  }

  type Batch = { id: string; status: BatchStatus; items: BatchItem[]; grade: number; file_name: string };
  const loadBatch = async (id: string) => {
    const { data } = await admin().from("import_batches").select("id,status,items,grade,file_name").eq("id", id).eq("teacher_id", u.id).maybeSingle();
    return data as Batch | null;
  };
  const saveItems = async (id: string, items: BatchItem[]) => {
    const { error } = await admin().from("import_batches").update({ items, updated_at: new Date().toISOString() } as never).eq("id", id).eq("teacher_id", u.id).eq("status", "draft");
    if (error) throw new Error("Lỗi cơ sở dữ liệu: " + error.message);
  };
  const within = <T,>(p: Promise<T>, what: string) => Promise.race([p, new Promise<never>((_, rej) => { const t = setTimeout(() => rej(new Error(`AI_TIMEOUT: ${what} quá 50s`)), 50_000); t.unref?.(); })]);

  if (b.action === "batch_start") {
    const { data: open } = await admin().from("import_batches").select("id").eq("teacher_id", u.id).eq("status", "draft").limit(1);
    if (open?.length) return bad("Còn một đợt nháp chưa xác nhận. Xác nhận hoặc hủy đợt đó trước.", 409);
    const items: BatchItem[] = b.items.map((x) => ({ statement: x.statement, answers: x.answers, steps: x.steps, status: "pending" }));
    const { data, error } = await admin().from("import_batches").insert({ teacher_id: u.id, file_name: b.file_name, grade: b.grade, sources: b.sources, read_errors: b.read_errors, items } as never).select("id").single();
    if (error) throw new Error("Lỗi cơ sở dữ liệu: " + error.message);
    await log({ actor: "teacher", action: "import_batch_created", teacherId: u.id, meta: { file: b.file_name, found: items.length, with_answer: summary(items).withAnswer, read_errors: b.read_errors.length } });
    return Response.json({ ok: true, id: (data as { id: string }).id });
  }

  // Hai pha, mỗi pha một request ngắn dưới 60s: make = AI đọc đề thành đề nháp (tiêu đề, chủ đề, kỹ năng...), finish = AI viết lời giải, chỉ dẫn và kiểm chéo.
  // Kết quả ghi vào đợt nháp sau mỗi lượt nên đóng tab giữa chừng vẫn làm tiếp được. Đề đã có đáp số thì khóa luôn (giáo viên xác nhận ở bước xem trước).
  if (b.action === "batch_make" || b.action === "batch_finish") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const batch = await loadBatch(b.id);
    if (!batch) return bad("Không tìm thấy đợt nạp.", 404);
    if (batch.status !== "draft") return bad("Đợt này đã xác nhận hoặc đã hủy.", 409);
    const make = b.action === "batch_make";
    const todo = [...new Set(b.idx)].filter((i) => { const it = batch.items[i]; return !!it && (make ? it.status === "pending" || (it.status === "failed" && !it.draft) : !!it.draft && (it.status === "drafted" || it.status === "failed")); });
    const patch = new Map<number, Partial<BatchItem>>();
    const left = await pool(todo, PAR, Date.now() + BUDGET_MS, async (i) => {
      const it = batch.items[i];
      const name = `Đề thứ ${i + 1}`;
      if (make) {
        try {
          const raw = await askJson(cfg, NORMALIZE_SYSTEM + gradeRule(batch.grade) + taxonomyRule(batch.grade), [{ role: "user", text: it.statement }], problemSchema, { think: true, use: "normalize" });
          const out = walk({ ...raw, grade: batch.grade, statement: it.statement }) as Problem; // lớp do giáo viên chọn, đề bài là bản giáo viên đã duyệt
          out.id = "BT00"; out.reviewed = false; out.check_note = "";
          out.solution_steps = []; // do pha finish viết khớp đáp án
          if (Object.keys(it.answers).length) { out.solution = it.answers as Problem["solution"]; } // đáp số từ tệp chỉ để AI bám theo, không khóa: giáo viên tự xác nhận sau khi lưu
          out.answer_locked = false;
          patch.set(i, { status: "drafted", reason: "", draft: out });
        } catch (e) {
          await reportError(e, `nạp hàng loạt: đọc ${name}`, { teacherId: u.id, actor: "teacher" });
          patch.set(i, { status: "failed", reason: "AI chưa đọc được đề này. Bấm chạy lại." });
        }
        return;
      }
      const r0 = await within(standardizeProblem(cfg, holdAnswer(it.draft!, Object.keys(it.answers).length > 0), referenceNote(it.steps)), `làm ${name}`).catch(async (e) => { await reportError(e, `nạp hàng loạt: làm ${name}`, { teacherId: u.id, actor: "teacher" }); return "AI chưa trả lời được. Bấm chạy lại."; });
      const r = typeof r0 === "string" ? r0 : releaseAnswer(r0);
      if (typeof r === "string") {
        if (!r.startsWith("AI chưa trả lời được")) await reportError(new Error(r), `nạp hàng loạt ${name}: không đạt chuẩn`, { teacherId: u.id, actor: "teacher", kind: "format" });
        patch.set(i, { status: "failed", reason: r.slice(0, 500) });
        return;
      }
      patch.set(i, { status: r.check_note ? "review" : "ok", reason: r.check_note ?? "", draft: r });
    });
    // Ghi gộp một lần (các đề chạy song song, tránh ghi đè lẫn nhau): đọc lại đợt mới nhất rồi chèn kết quả.
    const fresh = (await loadBatch(b.id)) ?? batch;
    patch.forEach((p, i) => { fresh.items[i] = { ...fresh.items[i], ...p }; });
    await saveItems(b.id, fresh.items);
    return Response.json({ ok: true, left, view: viewOf(fresh.items) });
  }

  // Xác nhận: chỉ các đề đạt (ok, review) được ghi vào bảng problems với mã BT mới; đề lỗi ở lại trong đợt để tra lịch sử.
  if (b.action === "batch_confirm") {
    const batch = await loadBatch(b.id);
    if (!batch) return bad("Không tìm thấy đợt nạp.", 404);
    if (batch.status !== "draft") return bad("Đợt này đã xác nhận hoặc đã hủy.", 409);
    const ready = batch.items.flatMap((it, i) => (it.draft && (it.status === "ok" || it.status === "review") ? [i] : []));
    if (!ready.length) return bad("Chưa có đề nào đạt để lưu. Chạy AI trước.");
    const now = new Date().toISOString();
    const { data: claim } = await admin().from("import_batches").update({ status: "confirmed", confirmed_at: now, updated_at: now } as never).eq("id", b.id).eq("teacher_id", u.id).eq("status", "draft").select("id");
    if (!claim?.length) return bad("Đợt này đã xác nhận hoặc đã hủy.", 409);
    try {
      const { data: have } = await admin().from("problems").select("code").eq("teacher_id", u.id).is("deleted_at", null);
      const taken = new Set(((have ?? []) as { code: string }[]).map((r) => r.code));
      const list: Problem[] = [];
      for (const i of ready) {
        const code = freeCode("BT01", taken); taken.add(code);
        batch.items[i].code = code;
        list.push({ ...batch.items[i].draft!, id: code });
      }
      await save(u.id, list);
      check(await admin().from("import_batches").update({ items: batch.items } as never).eq("id", b.id));
    } catch (e) {
      await admin().from("import_batches").update({ status: "draft", confirmed_at: null } as never).eq("id", b.id).then((x) => x, () => null); // lưu hỏng thì trả về nháp để thử lại
      throw e;
    }
    const sm = summary(batch.items);
    await log({ actor: "teacher", action: "import_batch_confirmed", teacherId: u.id, meta: { batch: b.id, saved: ready.length, failed: sm.failed, review: sm.review } });
    return Response.json({ ok: true, saved: ready.length, view: viewOf(batch.items) });
  }

  if (b.action === "batch_cancel") {
    const { data } = await admin().from("import_batches").update({ status: "cancelled", updated_at: new Date().toISOString() } as never).eq("id", b.id).eq("teacher_id", u.id).eq("status", "draft").select("id");
    if (!data?.length) return bad("Không hủy được: đợt không còn ở dạng nháp.", 409);
    await log({ actor: "teacher", action: "import_batch_cancelled", teacherId: u.id, meta: { batch: b.id } });
    return Response.json({ ok: true });
  }
  return undefined;
}
