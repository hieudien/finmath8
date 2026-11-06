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
import { missingAnswers } from "@/lib/answer-check";

const NORMALIZE_SYSTEM = `Bạn chuẩn hóa đề Toán lớp 8 (tình huống tài chính) từ văn bản thô sang JSON. Chỉ trả JSON một đối tượng đúng mẫu:
{"id":"TCxx","title":string,"grade":8,"topic":string,"statement":string (nguyên văn đề bài cho học sinh),"learning_objectives":[string],"data":{số liệu, tỉ lệ dạng thập phân 0.x},"solution":{đáp án chuẩn bằng số},"solution_steps":[lời giải từng bước, mỗi bước 1–2 câu có phép tính, bước cuối là kết luận],"common_errors":[string],"hints":[{"level":1,"text":..},{"level":2,"text":..},{"level":3,"text":..}],"extension":string,"rubric":{"identify":3,"plan":3,"calculate":3,"explain":3}}
Quy tắc: tự giải đề, tính đáp án thật cẩn thận, đừng bịa số không có trong đề. Gợi ý mức 1 chỉ hỏi định hướng; mức 2 gợi ý cách giải; mức 3 nêu bước tính đầu tiên, KHÔNG nêu kết quả cuối. Nếu văn bản có nhiều đề, chỉ chuẩn hóa đề đầu. Nếu thiếu id, dùng "TC99".`;

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
  z.object({ action: z.literal("save"), problems: z.array(z.unknown()).min(1) }),
  z.object({ action: z.literal("seed") }),
  z.object({ action: z.literal("explain"), id: z.string().uuid() }),
  z.object({ action: z.literal("selftest"), id: z.string().uuid() }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
]);

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

  if (b.action === "explain") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad("Chưa có API key. Vào Cài đặt để nhập.");
    const { data } = await admin().from("problems").select("content,version").eq("id", b.id).eq("teacher_id", u.id).is("deleted_at", null).maybeSingle();
    if (!data) return bad("Không tìm thấy đề.", 404);
    const row = data as { content: unknown; version: number };
    const pp = problemSchema.safeParse(row.content);
    if (!pp.success) return bad("Đề này lưu sai định dạng nên không tạo được lời giải. Hãy nạp lại đề.");
    const prob = pp.data;
    const out = await askJson(cfg, 'Viết lời giải từng bước (3–8 bước) cho bài Toán lớp 8. Mỗi bước 1–2 câu, nêu rõ phép tính và kết quả trung gian, bước cuối là kết luận. Lời giải PHẢI ra đúng đáp án đã cho trong "solution". Chỉ trả JSON {"steps": [string]}.', [{ role: "user", text: `${prob.statement ?? prob.title}
Dữ liệu: ${JSON.stringify(prob.data)}
Đáp án: ${JSON.stringify(prob.solution)}` }], z.object({ steps: z.array(z.string().min(3)).min(2).max(12) }));
    // Kiểm tra: mọi số lớn trong đáp án phải xuất hiện trong lời giải, nếu không thì không lưu (AI giải lệch đáp án).
    const missing = missingAnswers(prob.solution, out.steps);
    if (missing.length) return bad(`AI viết lời giải chưa khớp đáp án của đề (thiếu ${missing.join(", ")}). Bấm thử lại, hoặc kiểm tra lại đáp án trong đề.`);
    // Khóa theo version: nếu giáo viên vừa sửa đề trong lúc AI viết thì không ghi đè.
    const { data: upd, error: ue } = await admin().from("problems").update({ content: { ...prob, solution_steps: out.steps }, version: row.version + 1, updated_at: new Date().toISOString() } as never).eq("id", b.id).eq("teacher_id", u.id).eq("version", row.version).select("id");
    if (ue) throw new Error("Lỗi cơ sở dữ liệu: " + ue.message);
    if (!upd?.length) return bad("Đề vừa được sửa ở nơi khác. Tải lại trang rồi thử lại.", 409);
    await log({ actor: "teacher", action: "problem_updated", teacherId: u.id, meta: { code: prob.id, explain: true } });
    return Response.json({ ok: true });
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

  if (b.action === "normalize") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad("Chưa có API key. Vào Cài đặt để nhập.");
    const out = await askJson(cfg, NORMALIZE_SYSTEM, [{ role: "user", text: b.text }], problemSchema);
    // Lời giải lệch đáp án thì bỏ lời giải (giáo viên có thể bấm "Tạo lời giải bằng AI" sau).
    if (out.solution_steps.length && missingAnswers(out.solution, out.solution_steps).length) out.solution_steps = [];
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
