import { cookies } from "next/headers";
import { after } from "next/server";
import { api } from "@/lib/auth";
import { admin } from "@/lib/supabase/admin";
import { supabaseServer, currentUser } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { swallow } from "@/lib/errors";

// Trả lời ngay sau khi xóa cookie đăng nhập (vài ms). Việc thu hồi phiên ở Supabase và ghi nhật ký chạy sau khi đã phản hồi,
// nên người dùng không phải chờ 2 lượt gọi mạng (~400ms).
export const POST = api(async () => {
  const u = await currentUser();
  const { data } = await (await supabaseServer()).auth.getSession();
  const jwt = data.session?.access_token;

  const store = await cookies();
  store.getAll().filter((c) => c.name.startsWith("sb-")).forEach((c) => store.delete(c.name));

  after(async () => {
    if (jwt) await admin().auth.admin.signOut(jwt, "local").catch(swallow("thu hồi phiên khi đăng xuất", { teacherId: u?.id, actor: "teacher" }));
    if (u) await log({ actor: "teacher", action: "logout", teacherId: u.id });
  });
  return Response.json({ ok: true });
});
