import { admin } from "@/lib/supabase/admin";
import { parseProblems, type Problem } from "@/lib/schema/problem";
import { missingInfo } from "@/lib/ready";
import { ttl } from "@/lib/ttl";
import { isMode, type WorkMode } from "@/lib/modes";

export type Link = { id: string; teacher_id: string; active: boolean; expires_at: string | null; mode: WorkMode; problems: Problem[] };

type Row = { code: string; content: unknown };

// Đề trong liên kết = bản chụp lúc tạo, trừ khi đề gốc hiện đã khóa đáp án, đã duyệt và đủ thông tin: khi đó dùng bản mới nhất.
// Chưa đạt thì giữ bản chụp (đề bỏ khóa hay đang sửa dở không ra tới học sinh). Đề đã xóa hoặc đổi mã cũng giữ bản chụp.
export function livePick(snapshot: unknown, rows: Row[]): Problem[] {
  const by = new Map(rows.map((r) => [r.code, r.content as { answer_locked?: boolean; reviewed?: boolean }]));
  const merged = (Array.isArray(snapshot) ? snapshot : []).map((s: { id?: string }) => {
    const c = by.get(s?.id ?? "");
    return c && c.answer_locked === true && c.reviewed !== false && !missingInfo(c).length ? c : s;
  });
  return parseProblems(merged).ok;
}

export async function liveProblems(teacherId: string, snapshot: unknown): Promise<Problem[]> {
  const codes = (Array.isArray(snapshot) ? snapshot : []).map((s: { id?: string }) => s?.id).filter((x): x is string => !!x);
  const { data } = await admin().from("problems").select("code,content").eq("teacher_id", teacherId).is("deleted_at", null).in("code", codes);
  return livePick(snapshot, (data ?? []) as Row[]);
}

// Cache 30 giây: liên kết (đã phân tích đề) gần như không đổi trong lúc cả lớp chat. Bật/tắt/xóa (mềm) liên kết gọi getLink.clear() nên có hiệu lực ngay trên instance đó.
// Đề sửa xong có hiệu lực trong tối đa 30 giây.
export const getLink = ttl(30_000, async (slug: string): Promise<Link | null> => {
  const { data: l } = await admin().from("public_links").select("*").eq("slug", slug).is("deleted_at", null).maybeSingle();
  const r = l as (Omit<Link, "problems"> & { problems_snapshot: unknown }) | null;
  return r && { ...r, mode: isMode(r.mode) ? r.mode : "steps", problems: await liveProblems(r.teacher_id, r.problems_snapshot) };
});
