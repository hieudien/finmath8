import type { supabaseServer } from "@/lib/supabase/server";

// Thêm tên liên kết và mã học sinh vào các dòng nhật ký, để giáo viên không phải đọc mã nội bộ.
export async function nameRows<T extends { link_id: string | null; anon_id: string | null }>(sb: Awaited<ReturnType<typeof supabaseServer>>, rows: T[]) {
  const linkIds = [...new Set(rows.map((x) => x.link_id).filter((x): x is string => !!x))];
  const anonIds = [...new Set(rows.map((x) => x.anon_id).filter((x): x is string => !!x))];
  const [lk, st] = await Promise.all([
    linkIds.length ? sb.from("public_links").select("id,label").in("id", linkIds) : null,
    anonIds.length ? sb.from("chat_sessions").select("anon_id,student_code,started_at").in("anon_id", anonIds).not("student_code", "is", null).order("started_at", { ascending: false }) : null,
  ]);
  const link = new Map(((lk?.data ?? []) as { id: string; label: string }[]).map((x) => [x.id, x.label]));
  const student = new Map<string, string>();
  for (const x of (st?.data ?? []) as { anon_id: string; student_code: string }[]) if (!student.has(x.anon_id)) student.set(x.anon_id, x.student_code);
  return rows.map(({ anon_id, link_id, ...x }) => ({ ...x, link: link.get(link_id ?? "") ?? null, student: student.get(anon_id ?? "") ?? null }));
}
