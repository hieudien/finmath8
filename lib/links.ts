import { admin } from "@/lib/supabase/admin";
import { parseProblems, type Problem } from "@/lib/schema/problem";
import { ttl } from "@/lib/ttl";

export type Link = { id: string; teacher_id: string; active: boolean; expires_at: string | null; max_messages: number; problems: Problem[] };

// Cache 30 giây: liên kết (đã phân tích đề) gần như không đổi trong lúc cả lớp chat. Bật/tắt/xóa (mềm) liên kết gọi getLink.clear() nên có hiệu lực ngay trên instance đó.
export const getLink = ttl(30_000, async (slug: string): Promise<Link | null> => {
  const { data: l } = await admin().from("public_links").select("*").eq("slug", slug).is("deleted_at", null).maybeSingle();
  const r = l as (Omit<Link, "problems"> & { problems_snapshot: unknown }) | null;
  return r && { ...r, problems: parseProblems(r.problems_snapshot).ok };
});
