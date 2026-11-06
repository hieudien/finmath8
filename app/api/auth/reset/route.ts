import { z } from "zod";
import { contact } from "@/lib/errors";
import { api } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { log } from "@/lib/log";

export const POST = api(async (req) => {
  const p = z.object({ password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự") }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: p.error.issues[0].message }, { status: 400 });
  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return Response.json({ error: "Liên kết hết hạn. Yêu cầu đặt lại mật khẩu mới." }, { status: 401 });
  const { error } = await sb.auth.updateUser({ password: p.data.password });
  if (error) return Response.json({ error: `Không đổi được mật khẩu. Thử lại sau ít phút. ${contact()}` }, { status: 400 });
  await log({ actor: "teacher", action: "password_reset", teacherId: u.user.id });
  return Response.json({ ok: true });
});
