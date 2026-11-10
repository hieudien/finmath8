import { admin } from "@/lib/supabase/admin";
import { reportError } from "@/lib/errors";

type Entry = {
  actor: "teacher" | "student" | "system";
  action: string;
  teacherId?: string | null;
  anonId?: string | null;
  linkId?: string | null;
  meta?: Record<string, unknown>;
};

export async function log(e: Entry) {
  const { error } = await admin().from("activity_logs").insert({
    actor_type: e.actor, action: e.action, teacher_id: e.teacherId ?? null,
    anon_id: e.anonId ?? null, link_id: e.linkId ?? null, meta: e.meta ?? {},
  } as never);
  if (error) await reportError(new Error("Lỗi cơ sở dữ liệu: " + error.message), `ghi nhật ký ${e.action}`, { teacherId: e.teacherId, linkId: e.linkId, anonId: e.anonId });
}
