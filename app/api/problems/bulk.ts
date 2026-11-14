import { admin } from "@/lib/supabase/admin";
import { bad } from "@/lib/auth";
import { askJson } from "@/lib/llm";
import { llmCfg, withCtx } from "@/lib/teacher";
import { problemSchema, type Problem } from "@/lib/schema/problem";
import { log } from "@/lib/log";
import { reportError } from "@/lib/errors";
import { standardizeProblem } from "@/lib/fill";
import { PAR, BUDGET_MS, pool } from "@/lib/batch";
import { missingInfo, needsWork } from "@/lib/ready";
import { isBranch, taxonomyRule } from "@/lib/taxonomy";
import { checkSteps, crossCheck } from "@/lib/verify-solution";
import type { Body } from "./schema";
import { classifySchema } from "./schema";
import { NO_KEY, type Ctx } from "./ctx";

export async function bulkActions(b: Body, c: Ctx): Promise<Response | undefined> {
  const { u } = c;
  // Hàng loạt: client lấy danh sách đề còn việc (todo), rồi gửi từng lượt tối đa CHUNK đề (finish). Mỗi lượt làm được bao nhiêu đề trong BUDGET_MS thì trả phần còn lại (left) để client gửi tiếp.
  // Trạng thái nằm trong DB nên dừng giữa chừng hay đóng tab đều làm tiếp được.
  if (b.action === "todo") {
    const { data } = await admin().from("problems").select("id,content").eq("teacher_id", u.id).is("deleted_at", null).order("code");
    return Response.json({ ok: true, ids: ((data ?? []) as { id: string; content: unknown }[]).filter((r) => needsWork(r.content)).map((r) => r.id) });
  }

  // Tình trạng một đề (thiếu gì, đã khóa đáp án chưa): trang tạo liên kết cập nhật riêng đề đó sau khi chuẩn hóa, không tải lại cả trang.
  if (b.action === "state") {
    const { data } = await admin().from("problems").select("content").eq("id", b.id).eq("teacher_id", u.id).is("deleted_at", null).maybeSingle();
    if (!data) return bad("Không tìm thấy đề.", 404);
    const c = (data as { content: { answer_locked?: boolean } }).content;
    return Response.json({ ok: true, missing: missingInfo(c), unconfirmed: c.answer_locked !== true });
  }

  // Mọi đề chưa xóa, kể cả đề đã đạt chuẩn (nút "Chuẩn hóa tất cả" trong Cài đặt).
  if (b.action === "todo_all") {
    const { data } = await admin().from("problems").select("id").eq("teacher_id", u.id).is("deleted_at", null).order("code");
    return Response.json({ ok: true, ids: ((data ?? []) as { id: string }[]).map((r) => r.id) });
  }

  // Chỉ kiểm, không viết lại: AI giải lại đáp án (bỏ qua nếu đã khóa) và rà lời giải. Đề có vấn đề được gắn check_note
  // nên hiện "Cần xem lại" ở trang Đề bài và được nút Chuẩn hóa nhận làm lại. Đề không vấn đề giữ nguyên, không đổi version.
  if (b.action === "audit") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const { data } = await admin().from("problems").select("id,code,content,version").eq("teacher_id", u.id).is("deleted_at", null).in("id", b.ids);
    const flagged: { name: string; reason: string }[] = [], failed: { name: string; reason: string }[] = [];
    let checked = 0;
    const rows = (data ?? []) as { id: string; code: string; content: unknown; version: number }[];
    const left = await pool(rows, PAR, Date.now() + BUDGET_MS, async (row) => {
      const pp = problemSchema.safeParse(row.content);
      if (!pp.success) { checked++; flagged.push({ name: row.code, reason: "Đề lưu sai định dạng." }); return; }
      try {
        const run = async () => (pp.data.answer_locked ? "" : await crossCheck(withCtx(cfg, { problem: row.code }), pp.data)) || (await checkSteps(withCtx(cfg, { problem: row.code }), pp.data));
        const note = await Promise.race([run(), new Promise<never>((_, rej) => { const t = setTimeout(() => rej(new Error("AI_TIMEOUT: đề kiểm quá 50s")), 50_000); t.unref?.(); })]);
        checked++;
        if (!note) return;
        const { data: upd } = await admin().from("problems").update({ content: { ...pp.data, check_note: note.slice(0, 500) }, version: row.version + 1, updated_at: new Date().toISOString() } as never).eq("id", row.id).eq("version", row.version).select("id");
        flagged.push({ name: row.code, reason: upd?.length ? note : `${note} (đề vừa được sửa ở nơi khác nên chưa gắn cảnh báo, kiểm lại sau)` });
      } catch (e) {
        await reportError(e, `kiểm đề ${row.code}`, { teacherId: u.id, actor: "teacher" });
        failed.push({ name: row.code, reason: "AI chưa trả lời được." });
      }
    });
    return Response.json({ ok: true, checked, flagged, failed, left: left.map((r) => r.id) });
  }

  // Đề chưa có nhánh Đại số/Hình học.
  if (b.action === "classify_todo") {
    const { data } = await admin().from("problems").select("id,content").eq("teacher_id", u.id).is("deleted_at", null).order("code");
    return Response.json({ ok: true, ids: ((data ?? []) as { id: string; content: { branch?: unknown } }[]).filter((r) => !isBranch(r.content?.branch)).map((r) => r.id) });
  }

  // Phân loại nhanh bằng một lượt AI nhỏ (chỉ đọc đề bài): đặt nhánh; chủ đề chỉ điền khi đang trống. Không đụng lớp, đáp án, lời giải.
  if (b.action === "classify") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const { data } = await admin().from("problems").select("id,code,content,version").eq("teacher_id", u.id).is("deleted_at", null).in("id", b.ids);
    const failed: { name: string; reason: string }[] = [];
    let made = 0;
    const rows = (data ?? []) as { id: string; code: string; content: unknown; version: number }[];
    const left = await pool(rows, PAR, Date.now() + BUDGET_MS, async (row) => {
      const pp = problemSchema.safeParse(row.content);
      if (!pp.success) { failed.push({ name: row.code, reason: "Đề lưu sai định dạng." }); return; }
      const p = pp.data;
      try {
        const sys = `Phân loại một đề Toán lớp ${p.grade}. Chỉ trả JSON {"branch":"algebra"|"geometry"|"other","topic":string}.` + taxonomyRule(p.grade);
        const r = await askJson(withCtx(cfg, { problem: row.code }), sys, [{ role: "user", text: `Tiêu đề: ${p.title}\nChủ đề hiện có: ${p.topic}\nĐề bài: ${p.statement}` }], classifySchema, { think: "low", use: "classify", deadlineMs: 40_000 });
        const next: Problem = { ...p, branch: r.branch, topic: p.topic.trim() ? p.topic : r.topic.trim() };
        const { data: upd } = await admin().from("problems").update({ content: next, version: row.version + 1, updated_at: new Date().toISOString() } as never).eq("id", row.id).eq("teacher_id", u.id).eq("version", row.version).select("id");
        if (upd?.length) made++; else failed.push({ name: row.code, reason: "Đề vừa được sửa ở nơi khác, bấm phân loại lại sau." });
      } catch (e) {
        await reportError(e, `phân loại đề ${row.code}`, { teacherId: u.id, actor: "teacher" });
        failed.push({ name: row.code, reason: "AI chưa trả lời được." });
      }
    });
    return Response.json({ ok: true, made, failed, left: left.map((r) => r.id) });
  }

  if (b.action === "finish") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const { data } = await admin().from("problems").select("id,code,content,version").eq("teacher_id", u.id).is("deleted_at", null).in("id", b.ids);
    const failed: { name: string; reason: string }[] = [];
    let made = 0;
    const rows = (data ?? []) as { id: string; code: string; content: unknown; version: number }[];
    const left = await pool(rows, PAR, Date.now() + BUDGET_MS, async (row) => {
      const pp = problemSchema.safeParse(row.content);
      const r = pp.success ? await Promise.race([standardizeProblem(withCtx(cfg, { problem: row.code }), pp.data), new Promise<never>((_, rej) => { const t = setTimeout(() => rej(new Error("AI_TIMEOUT: đề làm quá 50s")), 50_000); t.unref?.(); })]).catch(async (e) => { await reportError(e, `hoàn thiện đề ${row.code}`, { teacherId: u.id, actor: "teacher" }); return "AI chưa trả lời được. Bấm chạy lại."; }) : "Đề lưu sai định dạng.";
      if (typeof r === "string") {
        failed.push({ name: row.code, reason: r });
        // Lỗi AI (exception) đã ghi ở trên; đề không đạt chuẩn thì ghi lý do vào Nhật ký lỗi để xem lại sau.
        // Đánh dấu "cần xem lại" ngay trên đề (check_note hiện ở danh sách và trang đề); nội dung đề giữ nguyên.
        if (pp.success && !r.startsWith("AI chưa trả lời được")) await admin().from("problems").update({ content: { ...pp.data, check_note: r.slice(0, 500) }, version: row.version + 1, updated_at: new Date().toISOString() } as never).eq("id", row.id).eq("version", row.version).then((x) => x, () => null);
        if (pp.success && !r.startsWith("AI chưa trả lời được")) await reportError(new Error(r), `chuẩn hóa đề ${row.code}: không đạt chuẩn`, { teacherId: u.id, actor: "teacher", kind: "format", meta: { code: row.code } });
        return;
      }
      const { data: upd } = await admin().from("problems").update({ content: r, version: row.version + 1, updated_at: new Date().toISOString() } as never).eq("id", row.id).eq("version", row.version).select("id").then((x) => x, () => ({ data: null }));
      if (upd?.length) { made++; await log({ actor: "teacher", action: "problem_standardized", teacherId: u.id, meta: { code: row.code, version: row.version + 1 } }); }
      else failed.push({ name: row.code, reason: "Đề vừa được sửa ở nơi khác." });
    });
    return Response.json({ ok: true, made, failed, left: left.map((r) => r.id) });
  }
  return undefined;
}
