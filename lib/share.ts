import { admin } from "@/lib/supabase/admin";

// Tra liên kết công khai của phụ huynh. Trả null nếu token sai định dạng, không có hoặc đã thu hồi.
export async function shareOf(token: string): Promise<{ teacherId: string; code: string } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await admin().from("student_shares").select("teacher_id,student_code").eq("token", token).is("revoked_at", null).maybeSingle();
  const r = data as { teacher_id: string; student_code: string } | null;
  return r ? { teacherId: r.teacher_id, code: r.student_code } : null;
}
