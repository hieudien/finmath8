import { supabaseServer } from "@/lib/supabase/server";
import { api, requireUser } from "@/lib/auth";
import { check } from "@/lib/db";
import { nameRows } from "@/lib/log-join";

type R = { id: number; ts: string; ref: string; kind: string; where_: string; message: string; stack: string | null; actor: string; link_id: string | null; anon_id: string | null; meta: Record<string, unknown> };

// 200 lỗi mới nhất của giáo viên (RLS giới hạn theo giáo viên). ?kind=<loại> lọc một loại, ?ref=<mã lỗi> tìm đúng mã học sinh hoặc giáo viên gửi.
export const GET = api(async (req) => {
  await requireUser();
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind"), ref = sp.get("ref")?.trim().toUpperCase();
  const sb = await supabaseServer();
  let q = sb.from("error_logs").select("id,ts,ref,kind,where_,message,stack,actor,link_id,anon_id,meta").order("id", { ascending: false }).limit(200);
  if (kind) q = q.eq("kind", kind);
  if (ref) q = q.eq("ref", ref);
  const r = await q;
  check(r);
  return Response.json({ rows: await nameRows(sb, (r.data ?? []) as R[]) });
});
