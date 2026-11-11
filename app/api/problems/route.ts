import { check } from "@/lib/db";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { api, bad, requireUser } from "@/lib/auth";
import { askJson } from "@/lib/llm";
import { llmCfg } from "@/lib/teacher";
import { lockIfAnswered, parseProblems, problemSchema, type Problem } from "@/lib/schema/problem";
import { SEED } from "@/lib/seed";
import { log } from "@/lib/log";
import { reportError, swallow } from "@/lib/errors";
import { missingAnswers } from "@/lib/answer-check";
import { finishProblem, makeSteps, referenceNote, standardizeProblem } from "@/lib/fill";
import { repairProblem, tidyLine, tidyStatement } from "@/lib/repair";
import { CHUNK, PAR, BUDGET_MS, freeCode, pool } from "@/lib/batch";
import { cannotLock, needsWork } from "@/lib/ready";
import { gradeRule } from "@/lib/grade";
import { readExamImage, type ImageResult } from "@/lib/read-image";
import { solveOnce } from "@/lib/solve";
import { walk } from "@/lib/latex-fix";
import { checkSteps, crossCheck } from "@/lib/verify-solution";
const NORMALIZE_SYSTEM = `Bạn chuẩn hóa một đề Toán từ văn bản thô sang JSON. Đề có thể thuộc bất kỳ chủ đề và lớp nào (giải phương trình, hình học, tỉ lệ, tình huống thực tế...). Chỉ trả JSON một đối tượng đúng mẫu:
{"id":"BTxx","title":string,"grade":số lớp (đúng lớp được giao ở cuối),"topic":string,"skills":[2–5 kỹ năng/kiến thức chính cần dùng, mỗi mục một cụm ngắn],"statement":string (nguyên văn đề bài cho học sinh; đề nhiều ý thì mỗi ý một dòng a), b), c) cách nhau bằng ký tự xuống dòng),"learning_objectives":[string],"data":{số liệu đề cho, nếu có; tỉ lệ dạng thập phân 0.x},"solution":{đáp án chuẩn. Số thì dạng số, ví dụ {"x":3}; nhiều nghiệm {"x1":2,"x2":-3}; vô nghiệm hoặc đáp án chữ {"ket_luan":"vô nghiệm"}},"solution_steps":[lời giải từng bước, mỗi bước 1–2 câu đủ chủ vị có phép tính, kết thúc bằng dấu chấm, liệt kê nhiều ý trong một bước thì ngăn bằng dấu chấm phẩy, bước cuối là kết luận],"common_errors":[sai lầm học sinh hay mắc với đề này],"hints":[{"level":1,"text":..},{"level":2,"text":..},{"level":3,"text":..}],"extension":string,"rubric":{"identify":3,"plan":3,"calculate":3,"explain":3}}
Quy tắc: công thức, phương trình có ký hiệu toán đặt trong $...$ theo LaTeX (ví dụ $x^2$, $2x + 3 = 11$), KHÔNG dùng \( \) hay \[ \]. Tự giải đề, tính đáp án thật cẩn thận, đừng bịa số không có trong đề. Gợi ý mức 1 chỉ hỏi định hướng; mức 2 gợi ý cách giải; mức 3 nêu bước tính đầu tiên, KHÔNG nêu kết quả cuối. Nếu văn bản có nhiều đề, chỉ chuẩn hóa đề đầu. Nếu thiếu id, dùng "BT99".`;

async function save(teacherId: string, list: Problem[]) {
  const db = admin();
  let n = 0;
  for (const p0 of list) {
    const p = repairProblem(p0); // mọi đường lưu (JSON, trình sửa) đều chuẩn hóa lời giải: bỏ "Bước N:", tách bước gộp
    const { data: ex } = await db.from("problems").select("id,version").eq("teacher_id", teacherId).eq("code", p.id).is("deleted_at", null).maybeSingle();
    const old = ex as { id: string; version: number } | null;
    if (old) {
      check(await db.from("problems").update({ content: p, version: old.version + 1, updated_at: new Date().toISOString() } as never).eq("id", old.id));
      await log({ actor: "teacher", action: "problem_updated", teacherId, meta: { code: p.id, version: old.version + 1 } });
    } else {
      check(await db.from("problems").insert({ teacher_id: teacherId, code: p.id, content: p } as never));
      await log({ actor: "teacher", action: "problem_created", teacherId, meta: { code: p.id } });
    }
    n++;
  }
  return n;
}

const grade = z.number({ error: "Chọn lớp cho đề." }).int().min(1, "Chọn lớp cho đề.").max(12, "Chọn lớp cho đề.");
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import_json"), raw: z.string().min(2) }),
  z.object({ action: z.literal("normalize"), text: z.string().min(20, "Văn bản quá ngắn."), grade }),
  z.object({ action: z.literal("read_image"), image: z.string().max(6_000_000, "Ảnh quá lớn.").regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Chỉ nhận ảnh png, jpeg, webp.") }),
  z.object({ action: z.literal("save"), problems: z.array(z.unknown()).min(1) }),
  z.object({ action: z.literal("seed") }),
  z.object({ action: z.literal("verify"), id: z.string().uuid() }),
  z.object({ action: z.literal("set_answer"), id: z.string().uuid(), solution: z.record(z.string(), z.unknown()).refine((s) => Object.keys(s).length > 0, "Đáp án đang trống.") }),
  z.object({ action: z.literal("lock_answer"), id: z.string().uuid() }),
  z.object({ action: z.literal("lock_answers"), ids: z.array(z.string().uuid()).min(1).max(50) }),
  z.object({ action: z.literal("unlock_answer"), id: z.string().uuid() }),
  z.object({ action: z.literal("todo") }),
  z.object({ action: z.literal("todo_all") }),
  z.object({ action: z.literal("finish"), ids: z.array(z.string().uuid()).min(1).max(CHUNK) }),
  z.object({ action: z.literal("audit"), ids: z.array(z.string().uuid()).min(1).max(CHUNK) }),
  z.object({ action: z.literal("normalize_batch"), texts: z.array(z.string().min(20).max(20_000)).min(1).max(CHUNK), grade }),
  z.object({ action: z.literal("complete"), problem: z.unknown() }),
  z.object({ action: z.literal("standardize_draft"), problem: z.unknown() }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
  z.object({ action: z.literal("rename"), id: z.string().uuid(), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9._-]{1,20}$/, "Mã đề gồm chữ và số, tối đa 20 ký tự.") }),
]);

export const maxDuration = 60; // hàng loạt nhiều đề gọi AI theo nhóm

export const POST = api(async (req, tr) => {
  const u = await requireUser();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.");
  const b = p.data;
  tr.action = b.action;

  if (b.action === "import_json") {
    let raw: unknown;
    try { raw = JSON.parse(b.raw); } catch { return bad("JSON sai cú pháp. Kiểm tra dấu ngoặc và dấu phẩy."); }
    const { ok, errors } = parseProblems(raw);
    if (errors.length) return bad(errors.join(" | "));
    const n = await save(u.id, ok.map(lockIfAnswered)); // đáp án do giáo viên đưa vào: khóa luôn
    return Response.json({ ok: true, saved: n });
  }

  // Đọc đề của giáo viên (đã qua kiểm định dạng) cùng version để khóa khi ghi lại.
  const NO_KEY = "Chưa có API key. Vào Cài đặt để nhập.";
  const load = async (id: string) => {
    const { data } = await admin().from("problems").select("content,version").eq("id", id).eq("teacher_id", u.id).is("deleted_at", null).maybeSingle();
    if (!data) return bad("Không tìm thấy đề.", 404);
    const row = data as { content: unknown; version: number };
    const pp = problemSchema.safeParse(row.content);
    return pp.success ? { prob: pp.data, version: row.version } : bad("Đề này lưu sai định dạng. Hãy nạp lại đề.");
  };
  // Khóa theo version: nếu giáo viên vừa sửa đề trong lúc AI viết thì không ghi đè. Trả Response khi lỗi, null khi đã lưu.
  const commit = async (id: string, version: number, content: Problem, meta: Record<string, unknown>) => {
    const { data: upd, error: ue } = await admin().from("problems").update({ content, version: version + 1, updated_at: new Date().toISOString() } as never).eq("id", id).eq("teacher_id", u.id).eq("version", version).select("id");
    if (ue) throw new Error("Lỗi cơ sở dữ liệu: " + ue.message);
    if (!upd?.length) return bad("Đề vừa được sửa ở nơi khác. Tải lại trang rồi thử lại.", 409);
    await log({ actor: "teacher", action: "problem_updated", teacherId: u.id, meta: { code: content.id, ...meta } });
    return null;
  };

  if (b.action === "verify") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const r = await load(b.id);
    if (r instanceof Response) return r;
    const { prob, version } = r;
    if (!Object.keys(prob.solution).length) return bad("Đề chưa có đáp án để kiểm tra.");
    const note = await crossCheck(cfg, prob);
    return (await commit(b.id, version, { ...prob, check_note: note }, { verify: !note })) ?? Response.json({ ok: true, match: !note, note });
  }

  // Khóa đáp án: chỉ giáo viên đặt được. Đáp án mới do giáo viên nhập thì xóa lời giải và chỉ dẫn cũ (chúng viết theo đáp án cũ), bấm "Chuẩn hóa đề" để AI viết lại theo đáp án này.
  if (b.action === "set_answer" || b.action === "lock_answer" || b.action === "unlock_answer") {
    const r = await load(b.id);
    if (r instanceof Response) return r;
    const { prob, version } = r;
    if (b.action === "unlock_answer") return (await commit(b.id, version, { ...prob, answer_locked: false }, { answer: "unlock" })) ?? Response.json({ ok: true });
    if (b.action === "lock_answer") {
      if (!Object.keys(prob.solution).length) return bad("Đề chưa có đáp án để xác nhận.");
      return (await commit(b.id, version, { ...prob, answer_locked: true, reviewed: true, check_note: "" }, { answer: "lock" })) ?? Response.json({ ok: true });
    }
    const next: Problem = { ...prob, solution: b.solution, answer_locked: true, check_note: "", solution_steps: [], step_goals: [], step_hints: [], step_checks: [], error_traps: [] };
    return (await commit(b.id, version, next, { answer: "set" })) ?? Response.json({ ok: true });
  }

  // Xác nhận đáp án nhiều đề cùng lúc (giáo viên đã tự kiểm tra từng đề): bỏ qua đề đã khóa, chưa có đáp án, sai định dạng hoặc vừa bị sửa ở nơi khác.
  if (b.action === "lock_answers") {
    const { data } = await admin().from("problems").select("id,code,content,version").eq("teacher_id", u.id).is("deleted_at", null).in("id", b.ids);
    const skipped: { name: string; reason: string }[] = [];
    let locked = 0;
    for (const row of (data ?? []) as { id: string; code: string; content: unknown; version: number }[]) {
      const why = cannotLock(row.content);
      if (why) { skipped.push({ name: row.code, reason: why }); continue; }
      const prob = problemSchema.parse(row.content);
      const res = await commit(row.id, row.version, { ...prob, answer_locked: true, reviewed: true, check_note: "" }, { answer: "lock", bulk: true });
      if (res) skipped.push({ name: row.code, reason: "Đề vừa được sửa ở nơi khác." }); else locked++;
    }
    return Response.json({ ok: true, locked, skipped });
  }

  // Hàng loạt: client lấy danh sách đề còn việc (todo), rồi gửi từng lượt tối đa CHUNK đề (finish). Mỗi lượt làm được bao nhiêu đề trong BUDGET_MS thì trả phần còn lại (left) để client gửi tiếp.
  // Trạng thái nằm trong DB nên dừng giữa chừng hay đóng tab đều làm tiếp được.
  if (b.action === "todo") {
    const { data } = await admin().from("problems").select("id,content").eq("teacher_id", u.id).is("deleted_at", null).order("code");
    return Response.json({ ok: true, ids: ((data ?? []) as { id: string; content: unknown }[]).filter((r) => needsWork(r.content)).map((r) => r.id) });
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
        const run = async () => (pp.data.answer_locked ? "" : await crossCheck(cfg, pp.data)) || (await checkSteps(cfg, pp.data));
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

  if (b.action === "finish") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const { data } = await admin().from("problems").select("id,code,content,version").eq("teacher_id", u.id).is("deleted_at", null).in("id", b.ids);
    const failed: { name: string; reason: string }[] = [];
    let made = 0;
    const rows = (data ?? []) as { id: string; code: string; content: unknown; version: number }[];
    const left = await pool(rows, PAR, Date.now() + BUDGET_MS, async (row) => {
      const pp = problemSchema.safeParse(row.content);
      const r = pp.success ? await Promise.race([standardizeProblem(cfg, pp.data), new Promise<never>((_, rej) => { const t = setTimeout(() => rej(new Error("AI_TIMEOUT: đề làm quá 50s")), 50_000); t.unref?.(); })]).catch(async (e) => { await reportError(e, `hoàn thiện đề ${row.code}`, { teacherId: u.id, actor: "teacher" }); return "AI chưa trả lời được. Bấm chạy lại."; }) : "Đề lưu sai định dạng.";
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

  // Đề thô -> đề nháp (chưa duyệt) lưu vào DB với mã mới BT01, BT02...; phần còn lại (đáp án khớp, lời giải, chỉ dẫn) do "finish" làm. texts là mảng của client: trả chỉ số.
  if (b.action === "normalize_batch") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const { data: have } = await admin().from("problems").select("code").eq("teacher_id", u.id).is("deleted_at", null);
    const taken = new Set(((have ?? []) as { code: string }[]).map((r) => r.code));
    const failed: { name: string; reason: string; i: number }[] = [];
    let made = 0;
    const left = await pool(b.texts.map((text, i) => ({ text, i })), PAR, Date.now() + BUDGET_MS, async ({ text, i }) => {
      try {
        const out = await askJson(cfg, NORMALIZE_SYSTEM + gradeRule(b.grade), [{ role: "user", text }], problemSchema, { think: true, use: "normalize" });
        out.grade = b.grade; // lớp do giáo viên chọn, không tin AI
        out.id = freeCode("BT01", taken); taken.add(out.id); // đồng bộ, không có await giữa kiểm và thêm nên các đề song song không trùng mã
        out.reviewed = false;
        out.solution_steps = []; out.step_goals = []; out.step_hints = []; out.step_checks = []; out.error_traps = []; // lời giải và chỉ dẫn do "finish" viết khớp đáp án
        await save(u.id, [out]);
        made++;
      } catch (e) {
        await reportError(e, "chuẩn hóa đề hàng loạt", { teacherId: u.id, actor: "teacher" });
        failed.push({ name: `Đề thứ ${i + 1} trong văn bản`, reason: "AI chưa chuẩn hóa được đề này.", i });
      }
    });
    return Response.json({ ok: true, made, failed, left: left.map((x) => x.i) });
  }

  // Một đề chưa lưu (trình sửa đề): làm cho đạt chuẩn rồi trả về, giáo viên bấm Lưu mới ghi.
  if (b.action === "complete") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const pp = problemSchema.safeParse(b.problem);
    if (!pp.success) return bad("Đề chưa đủ để AI hoàn thiện.");
    const done = await finishProblem(cfg, pp.data);
    if (typeof done === "string") { await reportError(new Error(done), `hoàn thiện đề ${pp.data.id}: không đạt chuẩn`, { teacherId: u.id, actor: "teacher", kind: "format", meta: { code: pp.data.id } }); return bad(done); } // ghi để tra được từ nhật ký lỗi
    return Response.json({ ok: true, problem: done });
  }

  // Đề đang soạn ở trình sửa: giữ nguyên đáp án giáo viên đã nhập, AI viết lại phần còn lại theo đề bài và đáp án đó. Trả về, giáo viên bấm Lưu mới ghi.
  if (b.action === "standardize_draft") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const pp = problemSchema.safeParse(b.problem);
    if (!pp.success) return bad("Đề chưa đủ để AI chuẩn hóa: " + (pp.error.issues[0]?.message ?? "sai định dạng") + ".");
    if (!Object.keys(pp.data.solution).length) return bad("Chưa có đáp án để giữ. Nhập đáp án hoặc bấm nút AI giải lại cả đáp án.");
    const r = await standardizeProblem(cfg, { ...pp.data, answer_locked: true }).catch(async (e) => { await reportError(e, "chuẩn hóa đề đang soạn", { teacherId: u.id, actor: "teacher" }); return "AI chưa trả lời được. Bấm chạy lại."; });
    if (typeof r === "string") { if (!/^AI chưa trả lời được/.test(r)) await reportError(new Error(r), `chuẩn hóa đề đang soạn ${pp.data.id}: không đạt chuẩn`, { teacherId: u.id, actor: "teacher", kind: "format", meta: { code: pp.data.id } }); return bad(r); }
    return Response.json({ ok: true, problem: { ...r, answer_locked: false } }); // khóa chỉ đặt khi giáo viên tick xác nhận và lưu
  }

  if (b.action === "read_image") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad("Chưa có API key. Vào Cài đặt để nhập.");
    const [head, b64] = b.image.split(",");
    const mime = head.slice(5, head.indexOf(";"));
    const legacy = async (deadlineMs: number): Promise<ImageResult> => {
    const out = await askJson(cfg, 'Đây là ảnh chụp một đề Toán. Đọc và PHÂN LOẠI nội dung trong ảnh, chép NGUYÊN VĂN, không tự giải, bỏ qua hình vẽ. Chỉ trả JSON {"statement": string, "answers": [{"name": string, "value": string}], "solution_steps": [string]}:\n- statement: CHỈ đề bài (giả thiết, câu hỏi). KHÔNG chứa đáp án, lời giải, "Giải", "ĐS", "Đáp số", "Hướng dẫn".\n- answers: đáp án cuối nếu ảnh có ghi đáp số hoặc có kết luận cuối lời giải (chép lại, KHÔNG tự tính). Mỗi đáp án một phần tử: x = 3 là {"name":"x","value":"3"}; nhiều nghiệm đặt tên x1, x2; đáp án chữ hoặc vô nghiệm là {"name":"ket_luan","value":"vô nghiệm"} viết ngắn gọn. Ảnh không có đáp án thì [].\n- solution_steps: các bước cách giải nếu ảnh có ghi, mỗi bước một mục, bỏ chữ "Bước N:". Ảnh không có cách giải thì [].\nẢnh nhiều đề thì chỉ lấy đề đầu. Trình bày rõ ràng: đề nhiều ý thì xuống dòng giữa các ý, mỗi ý bắt đầu bằng a), b), c) (hoặc 1), 2)), dòng đầu là phần dẫn chung; hệ phương trình nằm trên dòng riêng. TUYỆT ĐỐI KHÔNG xuống dòng bên trong một cặp $...$ (cả hệ cases phải nằm trên một dòng, các hàng cách nhau bằng ¦¦); chép đúng dấu chấm phẩy của đề. Chỗ xuống dòng là xuống dòng thật; TUYỆT ĐỐI không dùng dấu gạch chéo ngược hay ký tự ¦ để ngắt dòng ở NGOÀI công thức. MỌI biểu thức toán (kể cả đơn giản như $2x + 3 = 11$, $x^2$, $\\frac{1}{2}$) đều đặt trong $...$ theo LaTeX; hệ phương trình dùng cases, mỗi phương trình một hàng, các hàng cách nhau bằng 2 dấu ¦¦. QUAN TRỌNG: trong công thức, thay MỌI dấu gạch chéo ngược của LaTeX bằng ký tự ¦ (ví dụ ¦begin{cases}, ¦frac{1}{2}, ¦Delta), KHÔNG dùng dấu gạch chéo ngược.', [{ role: "user", text: "Đọc đề trong ảnh.", image: { mime, b64 } }], z.object({ statement: z.string(), answers: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) })).default([]), solution_steps: z.array(z.string()).default([]) }), { deadlineMs, attemptMs: 20_000, use: "read_image" });
    // Model hay viết sai dấu \ trong JSON (\begin thành ký tự điều khiển, \\ thành \), nên prompt bảo dùng ¦ thay \ rồi đổi lại ở đây.
    const fix = (s: string) => s.replaceAll("¦", "\\");
    // Dạng mảng {name,value}: khung JSON của Gemini bỏ additionalProperties nên đối tượng tự do hay bị trả rỗng.
    const solution = Object.fromEntries(out.answers.map((a) => [a.name, /^-?\d+(\.\d+)?$/.test(a.value.trim()) ? Number(a.value) : fix(a.value)]));
    // Chữ ngoài $...$: ¦ đứng trước chữ cái là dấu \ của lệnh LaTeX quên bọc $, còn lại là dấu ngắt dòng lạc nên bỏ.
    const fixText = (s: string) => s.replace(/\$\$[\s\S]+?\$\$|\$[^$]+?\$/g, (x) => fix(x)).replace(/¦(?=[A-Za-z])/g, "\\").replaceAll("¦", "");
    out.statement = tidyStatement(fixText(out.statement));
    out.solution_steps = out.solution_steps.map((s) => tidyLine(fixText(s))).filter((s) => s.trim());
    return { statement: out.statement, solution, solution_steps: out.solution_steps };
    };
    // Cách mới: model trả văn bản có thẻ, tự kiểm và đọc lại khi lỗi; không tách được thẻ thì rơi về cách cũ (legacy, JSON) ở trên.
    const out = await readExamImage(cfg, { mime, b64 }, legacy);
    if (!out.statement.trim()) { await reportError(new Error(`Đọc đề từ ảnh trả rỗng (${mime}, ${b64.length} ký tự)`), "đọc đề từ ảnh", { teacherId: u.id, actor: "teacher", kind: "format" }); return bad("Không thấy đề bài trong ảnh. Thử ảnh rõ hơn."); }
    await log({ actor: "teacher", action: "problem_image_read", teacherId: u.id, meta: { chars: out.statement.length, answer: !!Object.keys(out.solution).length, steps: out.solution_steps.length, attempts: out.attempts, warnings: out.warnings.length } });
    return Response.json({ ok: true, statement: out.statement.trim(), solution: out.solution, solution_steps: out.solution_steps, warnings: out.warnings });
  }

  if (b.action === "normalize") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad("Chưa có API key. Vào Cài đặt để nhập.");
    // Ba lần gọi AI nối tiếp phải xong trong 50s (hosting cắt ở 60s): mỗi bước nhận phần thời gian còn lại, quá hạn thì ném AI_TIMEOUT có cấu trúc thay vì bị cắt.
    const end = Date.now() + 50_000, left = (reserve = 0) => Math.max(3_000, end - Date.now() - reserve);
    const raw = await askJson(cfg, NORMALIZE_SYSTEM + gradeRule(b.grade), [{ role: "user", text: b.text }], problemSchema, { think: true, use: "normalize", deadlineMs: 25_000 });
    const out = walk({ ...raw, grade: b.grade }) as Problem;
    // Đáp án và lời giải do bước giải riêng viết (model chỉ giải, làm trước đáp án sau, tự thay số kiểm); phần còn lại của đề giữ như AI vừa tạo. Hỏng thì giữ bản của AI.
    const sv = await solveOnce(cfg, { statement: out.statement, grade: b.grade }, { deadlineMs: left(12_000) }).catch(swallow("giải đề (normalize)", { teacherId: u.id, actor: "teacher" }));
    if (sv) {
      out.solution = sv.answers as Problem["solution"];
      // Lời giải chi tiết của bước giải riêng chỉ làm tham khảo: các bước hiển thị do makeSteps viết gọn (3–8 bước). Lỗi thì để trống, "complete" sẽ viết lại.
      const s = await makeSteps(cfg, out, referenceNote(sv.steps), left()).catch(swallow("viết các bước (normalize)", { teacherId: u.id, actor: "teacher" }));
      out.solution_steps = Array.isArray(s) ? s : [];
    } // sửa ký tự điều khiển do JSON nuốt dấu \ ngay khi nhận từ AI, trước khi trả cho trình duyệt
    // Lời giải lệch đáp án thì bỏ lời giải; "complete" viết lại. Kiểm chéo và chỉ dẫn do "complete" làm để mỗi request nằm trong 60s.
    if (out.solution_steps.length && missingAnswers(out.solution, out.solution_steps).length) out.solution_steps = [];
    out.reviewed = false; // chưa kiểm chéo: "complete" mới đặt true
    await log({ actor: "teacher", action: "problem_normalized", teacherId: u.id, meta: { code: out.id, chars: b.text.length } });
    return Response.json({ ok: true, problem: out });
  }

  if (b.action === "rename") {
    const { error } = await admin().rpc("rename_problem", { p_id: b.id, p_teacher: u.id, p_code: b.code } as never);
    if (error) return bad(error.message.startsWith("Mã đề") || error.message.startsWith("Không tìm") ? error.message : "Không đổi được mã đề.", error.message.startsWith("Không tìm") ? 404 : 400);
    await log({ actor: "teacher", action: "problem_updated", teacherId: u.id, meta: { code: b.code, renamed: true } });
    return Response.json({ ok: true });
  }

  if (b.action === "save") {
    const { ok, errors } = parseProblems(b.problems);
    if (errors.length) return bad(errors.join(" | "));
    return Response.json({ ok: true, saved: await save(u.id, ok) });
  }

  if (b.action === "seed") {
    // Chỉ thêm mã chưa có: không ghi đè đề giáo viên đã nạp hoặc đã sửa.
    const { data: have } = await admin().from("problems").select("code").eq("teacher_id", u.id).is("deleted_at", null);
    const codes = new Set(((have ?? []) as { code: string }[]).map((r) => r.code));
    const { ok } = parseProblems(SEED);
    return Response.json({ ok: true, saved: await save(u.id, ok.filter((x) => !codes.has(x.id)).map(lockIfAnswered)) });
  }

  const { error } = await admin().from("problems").update({ deleted_at: new Date().toISOString() } as never).eq("id", b.id).eq("teacher_id", u.id);
  if (error) return bad("Không xóa được.", 500);
  await log({ actor: "teacher", action: "problem_deleted", teacherId: u.id, meta: { id: b.id } });
  return Response.json({ ok: true });
});
