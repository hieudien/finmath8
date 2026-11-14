import { admin } from "@/lib/supabase/admin";
import { bad, requireUser } from "@/lib/auth";
import { problemSchema, type Problem } from "@/lib/schema/problem";
import { log } from "@/lib/log";

export type Ctx = ReturnType<typeof makeCtx>;
export const NO_KEY = "Chưa có API key. Vào Cài đặt để nhập.";

export function makeCtx(u: Awaited<ReturnType<typeof requireUser>>) {
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
  return { u, load, commit, NO_KEY };
}
