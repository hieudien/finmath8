import { supabaseServer } from "@/lib/supabase/server";
import { api, requireUser } from "@/lib/auth";
import { check } from "@/lib/db";
import { WARN } from "@/lib/log-labels";

type R = { id: number; ts: string; actor_type: string; action: string; anon_id: string | null; link_id: string | null; meta: Record<string, unknown> };

// 200 hoạt động mới nhất của giáo viên (RLS giới hạn theo giáo viên). ?action=<tên> lọc một loại, ?action=warn lọc các việc cần chú ý.
// Trả kèm tên liên kết và mã học sinh để giáo viên không phải đọc mã nội bộ.
export const GET = api(async (req) => {
  await requireUser();
  const action = new URL(req.url).searchParams.get("action");
  const sb = await supabaseServer();
  let q = sb.from("activity_logs").select("id,ts,actor_type,action,anon_id,link_id,meta").neq("action", "ai_call").neq("action", "ai_usage").order("id", { ascending: false }).limit(200);
  if (action === "warn") q = q.in("action", WARN);
  else if (action) q = q.eq("action", action);
  const r = await q;
  check(r);
  const rows = (r.data ?? []) as R[];
  const linkIds = [...new Set(rows.map((x) => x.link_id).filter((x): x is string => !!x))];
  const anonIds = [...new Set(rows.map((x) => x.anon_id).filter((x): x is string => !!x))];
  const [lk, st] = await Promise.all([
    linkIds.length ? sb.from("public_links").select("id,label").in("id", linkIds) : null,
    anonIds.length ? sb.from("chat_sessions").select("anon_id,student_code,started_at").in("anon_id", anonIds).not("student_code", "is", null).order("started_at", { ascending: false }) : null,
  ]);
  const link = new Map(((lk?.data ?? []) as { id: string; label: string }[]).map((x) => [x.id, x.label]));
  const student = new Map<string, string>();
  for (const x of (st?.data ?? []) as { anon_id: string; student_code: string }[]) if (!student.has(x.anon_id)) student.set(x.anon_id, x.student_code);
  return Response.json({ rows: rows.map(({ anon_id, link_id, ...x }) => ({ ...x, link: link.get(link_id ?? "") ?? null, student: student.get(anon_id ?? "") ?? null })) });
});
