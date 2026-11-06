import { z } from "zod";
import { contact } from "@/lib/errors";
import { api } from "@/lib/auth";
import { admin } from "@/lib/supabase/admin";
import { sendLinkMail } from "@/lib/mail";
import { log } from "@/lib/log";
import { siteUrl } from "@/lib/site";

export const POST = api(async (req) => {
  const p = z.object({ email: z.string().email("Email không hợp lệ") }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: p.error.issues[0].message }, { status: 400 });
  const { data } = await admin().auth.admin.generateLink({ type: "recovery", email: p.data.email });
  if (data?.properties) {
    const link = `${siteUrl()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=/reset`;
    try {
      await sendLinkMail(p.data.email, "recovery", link);
    } catch (e) {
      console.error("mail", e);
      return Response.json({ error: `Không gửi được email. Chờ vài phút rồi thử lại. ${contact()}` }, { status: 502 });
    }
    await log({ actor: "teacher", action: "password_reset_requested", teacherId: data.user.id });
  }
  return Response.json({ ok: true }); // luôn ok: không lộ email nào đã đăng ký
});
