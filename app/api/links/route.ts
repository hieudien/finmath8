import { check } from "@/lib/db";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { api, bad, requireUser } from "@/lib/auth";
import { llmCfg } from "@/lib/teacher";
import { getLink } from "@/lib/links";
import { log } from "@/lib/log";

const slug = () => randomBytes(8).toString("base64url").replace(/[-_]/g, "x").slice(0, 10).toLowerCase();

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    label: z.string().trim().min(1, "Nhập tên liên kết."),
    tag: z.enum(["pre", "post", "experiment", "control"]).nullable().default(null),
    problemIds: z.array(z.string().uuid()).min(1, "Chọn ít nhất 1 đề."),
    maxMessages: z.number().int().min(5).max(200).default(40),
  }),
  z.object({ action: z.literal("toggle"), id: z.string().uuid(), active: z.boolean() }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
]);

export const POST = api(async (req) => {
  const u = await requireUser();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.");
  const b = p.data;
  const db = admin();

  if (b.action === "create") {
    if (!(await llmCfg(u.id))) return bad("Chưa có API key. Vào Cài đặt để nhập trước khi tạo liên kết.");
    const { data } = await db.from("problems").select("content").eq("teacher_id", u.id).is("deleted_at", null).in("id", b.problemIds);
    const snap = ((data ?? []) as { content: unknown }[]).map((r) => r.content);
    if (!snap.length) return bad("Không tìm thấy đề đã chọn.");
    const { data: row, error } = await db.from("public_links").insert({
      teacher_id: u.id, slug: slug(), label: b.label, tag: b.tag, problems_snapshot: snap, max_messages: b.maxMessages,
    } as never).select("id,slug").single();
    if (error || !row) return bad("Không tạo được liên kết.", 500);
    const r = row as { id: string; slug: string };
    await log({ actor: "teacher", action: "link_created", teacherId: u.id, linkId: r.id, meta: { label: b.label, problems: snap.length } });
    return Response.json({ ok: true, slug: r.slug });
  }

  if (b.action === "toggle") {
    check(await db.from("public_links").update({ active: b.active } as never).eq("id", b.id).eq("teacher_id", u.id));
    getLink.clear();
    await log({ actor: "teacher", action: "link_toggled", teacherId: u.id, linkId: b.id, meta: { active: b.active } });
    return Response.json({ ok: true });
  }

  await log({ actor: "teacher", action: "link_deleted", teacherId: u.id, meta: { id: b.id } });
  check(await db.from("public_links").delete().eq("id", b.id).eq("teacher_id", u.id));
  getLink.clear();
  return Response.json({ ok: true });
});
