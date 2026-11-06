import { admin } from "@/lib/supabase/admin";
import { check } from "@/lib/db";
import { log } from "@/lib/log";
import { parseProblems } from "@/lib/schema/problem";
import { SEED } from "@/lib/seed";

// Nạp 10 đề mẫu cho tài khoản mới. Bỏ qua mã đề đã có nên gọi lại không ghi đè gì.
export async function seedSampleProblems(teacherId: string) {
  const db = admin();
  const { data, error } = await db.from("problems").select("code").eq("teacher_id", teacherId).is("deleted_at", null);
  if (error) throw new Error("Lỗi cơ sở dữ liệu: " + error.message);
  const have = new Set(((data ?? []) as { code: string }[]).map((r) => r.code));
  const fresh = parseProblems(SEED).ok.filter((p) => !have.has(p.id));
  if (!fresh.length) return 0;
  check(await db.from("problems").insert(fresh.map((p) => ({ teacher_id: teacherId, code: p.id, content: p })) as never));
  await log({ actor: "system", action: "problems_seeded", teacherId, meta: { count: fresh.length } });
  return fresh.length;
}
