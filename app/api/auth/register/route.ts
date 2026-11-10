import { z } from "zod";
import { contact } from "@/lib/errors";
import { api } from "@/lib/auth";
import { admin } from "@/lib/supabase/admin";
import { sendLinkMail } from "@/lib/mail";
import { log } from "@/lib/log";
import { clientIp, limited, tooMany } from "@/lib/ratelimit";
import { siteUrl } from "@/lib/site";
import { reportError } from "@/lib/errors";
import { seedSampleProblems } from "@/lib/seed-account";

const body = z.object({ email: z.string().email("Email không hợp lệ"), password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự") });

export const POST = api(async (req) => {
  if (limited("reg" + clientIp(req), 5, 60 * 60_000)) return tooMany();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: p.error.issues[0].message }, { status: 400 });
  const { email, password } = p.data;
  const { data, error } = await admin().auth.admin.generateLink({ type: "signup", email, password });
  if (error || !data.properties) {
    const dup = /already|registered/i.test(error?.message ?? "");
    return Response.json({ error: dup ? "Email này đã đăng ký. Hãy đăng nhập hoặc đặt lại mật khẩu." : `Không tạo được tài khoản. Chờ vài phút rồi thử lại. ${contact()}` }, { status: dup ? 409 : 500 });
  }
  // Nạp sẵn 10 đề mẫu. Lỗi ở bước này không được làm hỏng việc đăng ký: giáo viên vẫn bấm "Thêm đề mẫu" được.
  try {
    await seedSampleProblems(data.user.id);
  } catch (e) {
    await reportError(e, "seed khi đăng ký", { teacherId: data.user.id });
  }
  const link = `${siteUrl()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=signup&next=/dashboard`;
  try {
    await sendLinkMail(email, "signup", link);
  } catch (e) {
    await reportError(e, "gửi mail xác nhận đăng ký", { teacherId: data.user.id, actor: "teacher", kind: "mail" });
    return Response.json({ error: `Không gửi được email xác nhận. Chờ vài phút rồi thử lại. ${contact()}` }, { status: 502 });
  }
  await log({ actor: "teacher", action: "register", teacherId: data.user.id, meta: { email_domain: email.split("@")[1] } });
  return Response.json({ ok: true });
});
