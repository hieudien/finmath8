import { admin } from "@/lib/supabase/admin";
import { bad } from "@/lib/auth";
import { llmCfg, withCtx } from "@/lib/teacher";
import { problemSchema, type Problem } from "@/lib/schema/problem";
import { cannotLock } from "@/lib/ready";
import { crossCheck } from "@/lib/verify-solution";
import type { Body } from "./schema";
import { NO_KEY, type Ctx } from "./ctx";

export async function answersActions(b: Body, c: Ctx): Promise<Response | undefined> {
  const { u, load, commit } = c;
  if (b.action === "verify") {
    const cfg = await llmCfg(u.id);
    if (!cfg) return bad(NO_KEY);
    const r = await load(b.id);
    if (r instanceof Response) return r;
    const { prob, version } = r;
    if (!Object.keys(prob.solution).length) return bad("Đề chưa có đáp án để kiểm tra.");
    const note = await crossCheck(withCtx(cfg, { problem: prob.id }), prob);
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
    const next: Problem = { ...prob, solution: b.solution, answer_locked: true, check_note: "", solution_steps: [] };
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
  return undefined;
}
