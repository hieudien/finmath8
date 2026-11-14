import { bad } from "@/lib/auth";
import { askJson } from "@/lib/llm";
import { llmCfg, withCtx } from "@/lib/teacher";
import { problemSchema, type Problem } from "@/lib/schema/problem";
import { log } from "@/lib/log";
import { reportError, swallow } from "@/lib/errors";
import { missingAnswers } from "@/lib/answer-check";
import { finishProblem, makeSteps, referenceNote, standardizeProblem } from "@/lib/fill";
import { gradeRule } from "@/lib/grade";
import { taxonomyRule } from "@/lib/taxonomy";
import { proofAnswer, proofKey, solveOnce } from "@/lib/solve";
import { walk } from "@/lib/latex-fix";
import type { Body } from "./schema";
import { NO_KEY, type Ctx } from "./ctx";
import { NORMALIZE_SYSTEM } from "./normalize-prompt";

export async function draftActions(b: Body, c: Ctx): Promise<Response | undefined> {
  const { u } = c;
  // Một đề chưa lưu (trình sửa đề): làm cho đạt chuẩn rồi trả về, giáo viên bấm Lưu mới ghi.
  if (b.action === "complete") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const pp = problemSchema.safeParse(b.problem);
    if (!pp.success) return bad("Đề chưa đủ để AI hoàn thiện.");
    // Hosting cắt ở 60s: quá 50s thì báo lỗi rõ ràng (đã ghi nhật ký) thay vì để bị cắt giữa chừng.
    const slow = new Promise<never>((_, rej) => { const t = setTimeout(() => rej(new Error("AI_TIMEOUT: hoàn thiện đề quá 50s")), 50_000); t.unref?.(); });
    const done = await Promise.race([finishProblem(withCtx(cfg, { problem: pp.data.id }), pp.data), slow]).catch(async (e) => {
      await reportError(e, `hoàn thiện đề ${pp.data.id}`, { teacherId: u.id, actor: "teacher" });
      return null;
    });
    if (done === null) return bad("AI trả lời quá chậm. Bấm chạy lại.", 504);
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
    const r = await standardizeProblem(withCtx(cfg, { problem: pp.data.id }), { ...pp.data, answer_locked: true }).catch(async (e) => { await reportError(e, "chuẩn hóa đề đang soạn", { teacherId: u.id, actor: "teacher" }); return "AI chưa trả lời được. Bấm chạy lại."; });
    if (typeof r === "string") { if (!/^AI chưa trả lời được/.test(r)) await reportError(new Error(r), `chuẩn hóa đề đang soạn ${pp.data.id}: không đạt chuẩn`, { teacherId: u.id, actor: "teacher", kind: "format", meta: { code: pp.data.id } }); return bad(r); }
    return Response.json({ ok: true, problem: { ...r, answer_locked: false } }); // khóa chỉ đặt khi giáo viên tick xác nhận và lưu
  }

  if (b.action === "normalize") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad("Chưa có API key. Vào Cài đặt để nhập.");
    // Ba lần gọi AI nối tiếp phải xong trong 50s (hosting cắt ở 60s): mỗi bước nhận phần thời gian còn lại, quá hạn thì ném AI_TIMEOUT có cấu trúc thay vì bị cắt.
    const end = Date.now() + 50_000, left = (reserve = 0) => Math.max(3_000, end - Date.now() - reserve);
    const raw = await askJson(cfg, NORMALIZE_SYSTEM + gradeRule(b.grade) + taxonomyRule(b.grade), [{ role: "user", text: b.text }], problemSchema, { think: true, use: "normalize", deadlineMs: 25_000 });
    const out = walk({ ...raw, grade: b.grade }) as Problem;
    // Dòng "[Hình vẽ kèm theo đề: ...]" chỉ để AI đọc: AI có thể chép lại vào đề bài nên bỏ đi; hình và mô tả giữ ở trường figure.
    out.statement = out.statement.split(/\r?\n/).filter((l) => !l.trim().startsWith("[Hình vẽ kèm theo đề")).join("\n").trim();
    if (b.figure) out.figure = b.figure;
    // Đáp án và lời giải do bước giải riêng viết (model chỉ giải, làm trước đáp án sau, tự thay số kiểm); phần còn lại của đề giữ như AI vừa tạo. Hỏng thì giữ bản của AI.
    const sv = await solveOnce(cfg, { statement: out.statement, grade: b.grade, figure: out.figure }, { deadlineMs: left(12_000) }).catch(swallow("giải đề (normalize)", { teacherId: u.id, actor: "teacher" }));
    if (sv) {
      out.solution = proofAnswer(out.statement, sv.answers) as Problem["solution"];
      const pk = await proofKey(cfg, out, { deadlineMs: left(20_000) }); // đề chứng minh: trích đáp án ý "tìm/xác định" bằng gemini-3.5-flash
      if (pk !== null) out.solution = (pk ? { ket_luan: pk } : {}) as Problem["solution"];
      // Lời giải chi tiết của bước giải riêng chỉ làm tham khảo: các bước hiển thị do makeSteps viết gọn (3–8 bước). Lỗi thì để trống, "complete" sẽ viết lại.
      const s = await makeSteps(cfg, out, referenceNote(sv.steps) + (b.reference?.length ? `\nLời giải của giáo viên trong ảnh đề (chỉ tham khảo cách trình bày; có thể sai hoặc thiếu, kết quả phải theo đáp án trên):\n${b.reference.join("\n")}` : ""), left()).catch(swallow("viết các bước (normalize)", { teacherId: u.id, actor: "teacher" }));
      out.solution_steps = Array.isArray(s) ? s : [];
    } // sửa ký tự điều khiển do JSON nuốt dấu \ ngay khi nhận từ AI, trước khi trả cho trình duyệt
    // Lời giải lệch đáp án thì bỏ lời giải; "complete" viết lại. Kiểm chéo và chỉ dẫn do "complete" làm để mỗi request nằm trong 60s.
    if (out.solution_steps.length && missingAnswers(out.solution, out.solution_steps).length) out.solution_steps = [];
    out.reviewed = false; // chưa kiểm chéo: "complete" mới đặt true
    await log({ actor: "teacher", action: "problem_normalized", teacherId: u.id, meta: { code: out.id, chars: b.text.length } });
    return Response.json({ ok: true, problem: out });
  }
  return undefined;
}
