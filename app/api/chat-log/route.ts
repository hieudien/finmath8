import { supabaseServer } from "@/lib/supabase/server";
import { api, bad, requireUser } from "@/lib/auth";
import { check } from "@/lib/db";
import { mathHtml } from "@/lib/math-html";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Hội thoại của 1 phiên, đã dựng sẵn công thức (RLS giới hạn: giáo viên chỉ đọc được phiên của mình).
export const GET = api(async (req) => {
  await requireUser();
  const id = new URL(req.url).searchParams.get("session") ?? "";
  if (!UUID.test(id)) return bad("session không hợp lệ.");
  const r = await (await supabaseServer()).from("messages").select("role,content,ts").eq("session_id", id).order("id").limit(500);
  check(r);
  const items = ((r.data ?? []) as { role: "student" | "bot"; content: string; ts: string }[]).map((m) => ({
    role: m.role,
    time: new Date(m.ts).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
    html: mathHtml(m.content),
  }));
  return Response.json({ items });
});
