import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { api, bad, requireUser } from "@/lib/auth";

const body = z.object({ limit: z.number().int().min(0).max(1_000_000) });

export const POST = api(async (req) => {
  const u = await requireUser();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Hạn mức phải là số nguyên từ 0 trở lên.");
  const { error, count } = await admin().from("teacher_settings").update({ daily_limit: p.data.limit } as never, { count: "exact" }).eq("teacher_id", u.id);
  if (error) return bad("Chưa lưu được hạn mức. Có thể cơ sở dữ liệu chưa cập nhật (migration 005). Hãy liên hệ quản trị viên.", 500);
  if (!count) return bad("Hãy lưu cài đặt AI trước.", 400);
  return Response.json({ ok: true });
});
