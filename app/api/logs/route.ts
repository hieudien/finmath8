import { supabaseServer } from "@/lib/supabase/server";
import { api, requireUser } from "@/lib/auth";
import { check } from "@/lib/db";
import { WARN } from "@/lib/log-labels";
import { nameRows } from "@/lib/log-join";

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
  return Response.json({ rows: await nameRows(sb, (r.data ?? []) as R[]) });
});
