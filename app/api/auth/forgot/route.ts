import { z } from "zod";
import { contact, reportError } from "@/lib/errors";
import { api } from "@/lib/auth";
import { admin } from "@/lib/supabase/admin";
import { sendLinkMail } from "@/lib/mail";
import { log } from "@/lib/log";
import { clientIp, limited, tooMany } from "@/lib/ratelimit";
import { siteUrl } from "@/lib/site";

export const POST = api(async (req) => {
  if (limited("forgot" + clientIp(req), 5, 60 * 60_000)) return tooMany();
  const p = z.object({ email: z.string().email("Email không hợp lệ") }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: p.error.issues[0].message }, { status: 400 });
  if (limited("forgot-to" + p.data.email.toLowerCase(), 2, 60 * 60_000)) return Response.json({ ok: true }); // cùng 1 email: tối đa 2 thư/giờ, không báo lỗi để không lộ gì
  const { data } = await admin().auth.admin.generateLink({ type: "recovery", email: p.data.email });
  if (data?.properties) {
    const link = `${siteUrl()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=/reset`;
    try {
      await sendLinkMail(p.data.email, "recovery", link);
    } catch (e) {
      await reportError(e, "gửi mail đặt lại mật khẩu", { teacherId: data.user.id, actor: "teacher", kind: "mail" });
      return Response.json({ error: `Không gửi được email. Chờ vài phút rồi thử lại. ${contact()}` }, { status: 502 });
    }
    await log({ actor: "teacher", action: "password_reset_requested", teacherId: data.user.id });
  }
  return Response.json({ ok: true }); // luôn ok: không lộ email nào đã đăng ký
});
