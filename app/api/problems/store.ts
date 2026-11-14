import { check } from "@/lib/db";
import { admin } from "@/lib/supabase/admin";
import { bad } from "@/lib/auth";
import { lockIfAnswered, parseProblems, type Problem } from "@/lib/schema/problem";
import { SEED } from "@/lib/seed";
import { log } from "@/lib/log";
import { repairProblem } from "@/lib/repair";
import { blockers } from "@/lib/lint";
import type { Body } from "./schema";
import type { Ctx } from "./ctx";

export async function save(teacherId: string, list: Problem[]) {
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

export async function storeActions(b: Body, c: Ctx): Promise<Response | undefined> {
  const { u } = c;
  if (b.action === "rename") {
    const { error } = await admin().rpc("rename_problem", { p_id: b.id, p_teacher: u.id, p_code: b.code } as never);
    if (error) return bad(error.message.startsWith("Mã đề") || error.message.startsWith("Không tìm") ? error.message : "Không đổi được mã đề.", error.message.startsWith("Không tìm") ? 404 : 400);
    await log({ actor: "teacher", action: "problem_updated", teacherId: u.id, meta: { code: b.code, renamed: true } });
    return Response.json({ ok: true });
  }

  if (b.action === "save") {
    const { ok, errors } = parseProblems(b.problems);
    if (errors.length) return bad(errors.join(" | "));
    // Đề đánh dấu đã duyệt (giáo viên bấm lưu) mà còn lỗi nặng thì không lưu; đề AI mới tạo (reviewed=false) vẫn lưu để chờ duyệt.
    const blocked = ok.filter((x) => x.reviewed !== false && blockers(x).length).map((x) => `${x.id}: ${blockers(x)[0]}`);
    if (blocked.length) return bad(`Không lưu được vì đề còn lỗi nặng. ${blocked.slice(0, 3).join(" | ")}`);
    return Response.json({ ok: true, saved: await save(u.id, ok) });
  }

  if (b.action === "seed") {
    // Chỉ thêm mã chưa có: không ghi đè đề giáo viên đã nạp hoặc đã sửa.
    const { data: have } = await admin().from("problems").select("code").eq("teacher_id", u.id).is("deleted_at", null);
    const codes = new Set(((have ?? []) as { code: string }[]).map((r) => r.code));
    const { ok } = parseProblems(SEED);
    return Response.json({ ok: true, saved: await save(u.id, ok.filter((x) => !codes.has(x.id)).map(lockIfAnswered)) });
  }

  if (b.action !== "delete") return undefined;
  const { error } = await admin().from("problems").update({ deleted_at: new Date().toISOString() } as never).eq("id", b.id).eq("teacher_id", u.id);
  if (error) return bad("Không xóa được.", 500);
  await log({ actor: "teacher", action: "problem_deleted", teacherId: u.id, meta: { id: b.id } });
  return Response.json({ ok: true });
  return undefined;
}
