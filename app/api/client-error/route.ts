import { z } from "zod";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/supabase/server";
import { getLink } from "@/lib/links";
import { reportError } from "@/lib/errors";
import { clientIp, limited, tooMany } from "@/lib/ratelimit";

const body = z.object({ message: z.string().min(1).max(300), stack: z.string().max(1500).optional(), path: z.string().max(200), slug: z.string().max(80).optional() });

// Lỗi từ trình duyệt (giáo viên và học sinh). Không cần đăng nhập vì học sinh không có tài khoản: giới hạn 10 lỗi mỗi phút mỗi IP (chỉ đếm trong RAM, không lưu IP).
export async function POST(req: Request) {
  if (limited("ce" + clientIp(req), 10, 60_000)) return tooMany();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
  const { message, stack, path, slug } = p.data;
  const link = slug ? await getLink(slug).catch(() => null) : null;
  const u = link ? null : await currentUser().catch(() => null);
  const anon = (await cookies()).get("fm_anon")?.value;
  const ref = await reportError(Object.assign(new Error(message), { stack }), `trình duyệt ${path}`, {
    kind: "client", actor: link ? "student" : "teacher", teacherId: link?.teacher_id ?? u?.id, linkId: link?.id, anonId: anon && /^[0-9a-f-]{36}$/.test(anon) ? anon : undefined,
  });
  return Response.json({ ok: true, ref });
}
