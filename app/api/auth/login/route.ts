import { z } from "zod";
import { api } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { clientIp, limited, tooMany } from "@/lib/ratelimit";

const body = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = api(async (req) => {
  if (limited("login" + clientIp(req), 10, 5 * 60_000)) return tooMany();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Nhập email và mật khẩu." }, { status: 400 });
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword(p.data);
  if (error || !data.user) {
    const unconfirmed = /confirm/i.test(error?.message ?? "");
    await log({ actor: "teacher", action: "login_failed", meta: { reason: unconfirmed ? "unconfirmed" : "bad_credentials" } });
    return Response.json({ error: unconfirmed ? "Email chưa xác nhận. Mở email xác nhận trước khi đăng nhập." : "Email hoặc mật khẩu sai." }, { status: 401 });
  }
  await log({ actor: "teacher", action: "login", teacherId: data.user.id });
  return Response.json({ ok: true });
});
