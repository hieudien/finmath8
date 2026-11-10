import { check } from "@/lib/db";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { api, bad, requireUser } from "@/lib/auth";
import { askJson } from "@/lib/llm";
import { llmCfg } from "@/lib/teacher";
import { parseProblems, problemSchema, type Problem } from "@/lib/schema/problem";
import { SEED } from "@/lib/seed";
import { runSelfTest } from "@/lib/chat/selftest";
import { log } from "@/lib/log";
import { reportError } from "@/lib/errors";
import { missingAnswers } from "@/lib/answer-check";
import { fillMissing, makeSteps } from "@/lib/fill";
import { makeGreeting } from "@/lib/greeting";
import { makeStepGuides } from "@/lib/step-guides";
import { hasGuides } from "@/lib/chat/goals";

const NORMALIZE_SYSTEM = `Bạn chuẩn hóa một đề Toán từ văn bản thô sang JSON. Đề có thể thuộc bất kỳ chủ đề và lớp nào (giải phương trình, hình học, tỉ lệ, tình huống thực tế...). Chỉ trả JSON một đối tượng đúng mẫu:
{"id":"BTxx","title":string,"grade":số lớp (đoán theo đề, mặc định 8),"topic":string,"skills":[2–5 kỹ năng/kiến thức chính cần dùng, mỗi mục một cụm ngắn],"statement":string (nguyên văn đề bài cho học sinh),"learning_objectives":[string],"data":{số liệu đề cho, nếu có; tỉ lệ dạng thập phân 0.x},"solution":{đáp án chuẩn. Số thì dạng số, ví dụ {"x":3}; nhiều nghiệm {"x1":2,"x2":-3}; vô nghiệm hoặc đáp án chữ {"ket_luan":"vô nghiệm"}},"solution_steps":[lời giải từng bước, mỗi bước 1–2 câu có phép tính, bước cuối là kết luận],"common_errors":[sai lầm học sinh hay mắc với đề này],"hints":[{"level":1,"text":..},{"level":2,"text":..},{"level":3,"text":..}],"extension":string,"rubric":{"identify":3,"plan":3,"calculate":3,"explain":3}}
Quy tắc: công thức, phương trình có ký hiệu toán đặt trong $...$ theo LaTeX (ví dụ $x^2$, $2x + 3 = 11$), KHÔNG dùng \( \) hay \[ \]. Tự giải đề, tính đáp án thật cẩn thận, đừng bịa số không có trong đề. Gợi ý mức 1 chỉ hỏi định hướng; mức 2 gợi ý cách giải; mức 3 nêu bước tính đầu tiên, KHÔNG nêu kết quả cuối. Nếu văn bản có nhiều đề, chỉ chuẩn hóa đề đầu. Nếu thiếu id, dùng "BT99".`;

async function save(teacherId: string, list: Problem[]) {
  const db = admin();
  let n = 0;
  for (const p of list) {
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

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import_json"), raw: z.string().min(2) }),
  z.object({ action: z.literal("normalize"), text: z.string().min(20, "Văn bản quá ngắn.") }),
  z.object({ action: z.literal("read_image"), image: z.string().max(6_000_000, "Ảnh quá lớn.").regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Chỉ nhận ảnh png, jpeg, webp.") }),
  z.object({ action: z.literal("save"), problems: z.array(z.unknown()).min(1) }),
  z.object({ action: z.literal("seed") }),
  z.object({ action: z.literal("greetings") }),
  z.object({ action: z.literal("explain"), id: z.string().uuid() }),
  z.object({ action: z.literal("fill"), id: z.string().uuid() }),
  z.object({ action: z.literal("step_guides"), id: z.string().uuid() }),
  z.object({ action: z.literal("step_guides_all") }),
  z.object({ action: z.literal("selftest"), id: z.string().uuid() }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
]);

export const maxDuration = 60; // hàng loạt nhiều đề gọi AI theo nhóm

export const POST = api(async (req) => {
  const u = await requireUser();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.");
  const b = p.data;

  if (b.action === "import_json") {
    let raw: unknown;
    try { raw = JSON.parse(b.raw); } catch { return bad("JSON sai cú pháp. Kiểm tra dấu ngoặc và dấu phẩy."); }
    const { ok, errors } = parseProblems(raw);
    if (errors.length) return bad(errors.join(" | "));
    const n = await save(u.id, ok);
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
  const withGuides = (p: Problem, g: { goals: string[]; hints: string[][] } | null): Problem => ({ ...p, step_goals: g?.goals ?? [], step_hints: g?.hints ?? [], step_choices: [] });

  if (b.action === "explain" || b.action === "fill" || b.action === "step_guides") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const r = await load(b.id);
    if (r instanceof Response) return r;
    const { prob, version } = r;
    if (b.action === "explain") {
      const steps = await makeSteps(cfg, prob);
      if (typeof steps === "string") return bad(steps);
      const guides = await makeStepGuides(cfg, prob, steps); // chỉ dẫn + gợi ý riêng từng bước; lỗi thì để trống, học sinh dùng gợi ý chung
      return (await commit(b.id, version, withGuides({ ...prob, solution_steps: steps }, guides), { explain: true })) ?? Response.json({ ok: true });
    }
    // Nạp thêm phần còn thiếu (đáp án, lời giải từng bước, chỉ dẫn từng bước) để đề dùng được cho cả chat và từng bước.
    if (b.action === "fill") {
      const filled = await fillMissing(cfg, prob);
      if (typeof filled === "string") return bad(filled);
      return (await commit(b.id, version, filled, { fill: true })) ?? Response.json({ ok: true });
    }
    if (!prob.solution_steps.length) return bad("Đề chưa có lời giải từng bước. Tạo lời giải trước.");
    const g = await makeStepGuides(cfg, prob);
    if (!g) return bad("AI chưa viết được chỉ dẫn cho từng bước. Bấm thử lại.");
    return (await commit(b.id, version, withGuides(prob, g), { step_guides: true })) ?? Response.json({ ok: true });
  }

  // Hàng loạt: mọi đề có lời giải từng bước mà chưa đủ chỉ dẫn. Song song từng nhóm 3 đề như "greetings".
  // Hết ~45 giây thì dừng và báo số đề còn lại (maxDuration 60s); giáo viên bấm lại để làm tiếp.
  if (b.action === "step_guides_all") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const { data } = await admin().from("problems").select("id,content,version").eq("teacher_id", u.id).is("deleted_at", null);
    let made = 0, failed = 0;
    const todo = ((data ?? []) as { id: string; content: unknown; version: number }[]).flatMap((row) => {
      const pp = problemSchema.safeParse(row.content);
      return pp.success && pp.data.solution_steps.length && !hasGuides(pp.data) ? [{ row, prob: pp.data }] : [];
    });
    const stop = Date.now() + 45_000;
    let i = 0;
    for (; i < todo.length && Date.now() < stop; i += 3) {
      await Promise.all(todo.slice(i, i + 3).map(async ({ row, prob }) => {
        const g = await makeStepGuides(cfg, prob);
        if (!g) { failed++; return; }
        const { data: upd } = await admin().from("problems").update({ content: withGuides(prob, g), version: row.version + 1, updated_at: new Date().toISOString() } as never).eq("id", row.id).eq("version", row.version).select("id");
        if (upd?.length) made++; else failed++;
      }));
    }
    return Response.json({ ok: true, made, failed, left: Math.max(0, todo.length - i) });
  }

  if (b.action === "greetings") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad("Chưa có API key. Vào Cài đặt để nhập.");
    const { data } = await admin().from("problems").select("id,content,version").eq("teacher_id", u.id).is("deleted_at", null);
    let made = 0, failed = 0;
    const todo = ((data ?? []) as { id: string; content: unknown; version: number }[]).flatMap((row) => {
      const pp = problemSchema.safeParse(row.content);
      return pp.success && !pp.data.greeting ? [{ row, prob: pp.data }] : [];
    });
    // Song song từng nhóm 3 đề: nhanh hơn tuần tự mà chưa vượt giới hạn tốc độ của nhà cung cấp AI.
    for (let i = 0; i < todo.length; i += 3) {
      await Promise.all(todo.slice(i, i + 3).map(async ({ row, prob }) => {
        const greeting = await makeGreeting(cfg, prob).catch(async (e) => { await reportError(e, "tạo lời chào", { teacherId: u.id, actor: "teacher" }); return ""; });
        if (!greeting) { failed++; return; }
        const { data: upd } = await admin().from("problems").update({ content: { ...prob, greeting }, version: row.version + 1, updated_at: new Date().toISOString() } as never).eq("id", row.id).eq("version", row.version).select("id");
        if (upd?.length) made++; else failed++;
      }));
    }
    return Response.json({ ok: true, made, failed });
  }

  if (b.action === "selftest") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad("Chưa có API key. Vào Cài đặt để nhập.");
    const { data } = await admin().from("problems").select("content").eq("id", b.id).eq("teacher_id", u.id).is("deleted_at", null).maybeSingle();
    if (!data) return bad("Không tìm thấy đề.", 404);
    const sp = problemSchema.safeParse((data as { content: unknown }).content);
    if (!sp.success) return bad("Đề này lưu sai định dạng nên không kiểm thử được. Hãy nạp lại đề.");
    const prob = sp.data;
    const results = await runSelfTest(cfg, prob);
    await log({ actor: "teacher", action: "problem_selftest", teacherId: u.id, meta: { code: prob.id, passed: results.filter((r) => r.pass).length, total: results.length } });
    return Response.json({ ok: true, results });
  }

  if (b.action === "read_image") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad("Chưa có API key. Vào Cài đặt để nhập.");
    const [head, b64] = b.image.split(",");
    const mime = head.slice(5, head.indexOf(";"));
    const out = await askJson(cfg, 'Chép lại NGUYÊN VĂN mọi chữ và công thức trong ảnh (đây là ảnh chụp đề Toán), không giải, bỏ qua hình vẽ. Công thức đặt trong $...$ theo LaTeX; hệ phương trình dùng cases, mỗi phương trình một hàng, các hàng cách nhau bằng 2 dấu ¦¦. QUAN TRỌNG: trong công thức, thay MỌI dấu gạch chéo ngược của LaTeX bằng ký tự ¦ (ví dụ ¦begin{cases}, ¦frac{1}{2}, ¦Delta), KHÔNG dùng dấu gạch chéo ngược. Chỉ trả JSON {"statement": string}.', [{ role: "user", text: "Đọc đề trong ảnh.", image: { mime, b64 } }], z.object({ statement: z.string() }), { deadlineMs: 50_000, attemptMs: 20_000, use: "read_image" });
    // Model hay viết sai dấu \ trong JSON (\begin thành ký tự điều khiển, \\ thành \), nên prompt bảo dùng ¦ thay \ rồi đổi lại ở đây.
    out.statement = out.statement.replaceAll("¦", "\\");
    if (!out.statement.trim()) { await reportError(new Error(`Đọc đề từ ảnh trả rỗng (${mime}, ${b64.length} ký tự)`), "đọc đề từ ảnh", { teacherId: u.id, actor: "teacher", kind: "format" }); return bad("Không thấy đề bài trong ảnh. Thử ảnh rõ hơn."); }
    await log({ actor: "teacher", action: "problem_image_read", teacherId: u.id, meta: { chars: out.statement.length } });
    return Response.json({ ok: true, statement: out.statement.trim() });
  }

  if (b.action === "normalize") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad("Chưa có API key. Vào Cài đặt để nhập.");
    const out = await askJson(cfg, NORMALIZE_SYSTEM, [{ role: "user", text: b.text }], problemSchema, { think: true, use: "normalize" });
    // Lời giải lệch đáp án thì bỏ lời giải (giáo viên có thể bấm "Tạo lời giải bằng AI" sau).
    if (out.solution_steps.length && missingAnswers(out.solution, out.solution_steps).length) out.solution_steps = [];
    out.reviewed = false; // AI tạo: giáo viên phải duyệt trong trình sửa đề
    out.greeting = await makeGreeting(cfg, out).catch(async (e) => { await reportError(e, "tạo lời chào", { teacherId: u.id, actor: "teacher" }); return ""; }); // lỗi AI thì để trống, chat dùng câu dự phòng; có thể bấm tạo lại sau
    await log({ actor: "teacher", action: "problem_normalized", teacherId: u.id, meta: { code: out.id, chars: b.text.length } });
    return Response.json({ ok: true, problem: out });
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
    return Response.json({ ok: true, saved: await save(u.id, ok.filter((x) => !codes.has(x.id))) });
  }

  const { error } = await admin().from("problems").update({ deleted_at: new Date().toISOString() } as never).eq("id", b.id).eq("teacher_id", u.id);
  if (error) return bad("Không xóa được.", 500);
  await log({ actor: "teacher", action: "problem_deleted", teacherId: u.id, meta: { id: b.id } });
  return Response.json({ ok: true });
});
