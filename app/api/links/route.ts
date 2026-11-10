import { check } from "@/lib/db";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { api, bad, requireUser } from "@/lib/auth";
import { llmCfg } from "@/lib/teacher";
import { getLink } from "@/lib/links";
import { missingInfo } from "@/lib/ready";
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
    // Chặn ở server (giao diện chỉ khóa ô chọn): đáp án phải do giáo viên xác nhận, vì AI có thể giải sai.
    const unconfirmed = snap.filter((c) => (c as { answer_locked?: boolean }).answer_locked !== true).map((c) => (c as { id?: string }).id ?? "?");
    if (unconfirmed.length) return bad(`Đề ${unconfirmed.join(", ")} chưa xác nhận đáp án. Mở đề, kiểm tra rồi khóa đáp án trước khi tạo liên kết.`);
    if (snap.some((c) => (c as { reviewed?: boolean }).reviewed === false)) return bad("Có đề AI tạo chưa duyệt. Mở đề, kiểm tra rồi lưu trước khi tạo liên kết.");
    // Đề phải đủ cho cả chat và từng bước: giáo viên đổi kiểu sau này thì liên kết cũ vẫn chạy được.
    const lack = snap.flatMap((c) => { const m = missingInfo(c); return m.length ? [`${(c as { id?: string }).id ?? "?"} (thiếu ${m.join(", ")})`] : []; });
    if (lack.length) return bad(`Có đề chưa đủ thông tin cho cả chat và từng bước: ${lack.join("; ")}. Vào Đề bài, bấm "Chuẩn hóa đề" cho đề đó rồi tạo lại.`);
    const { data: row, error } = await db.from("public_links").insert({
      teacher_id: u.id, slug: slug(), label: b.label, tag: b.tag, problems_snapshot: snap, max_messages: b.maxMessages,
    } as never).select("id,slug").single();
    if (error || !row) return bad("Không tạo được liên kết.", 500);
    const r = row as { id: string; slug: string };
    await log({ actor: "teacher", action: "link_created", teacherId: u.id, linkId: r.id, meta: { label: b.label, problems: snap.length } });
    return Response.json({ ok: true, slug: r.slug });
  }

  if (b.action === "toggle") {
    check(await db.from("public_links").update({ active: b.active } as never).eq("id", b.id).eq("teacher_id", u.id).is("deleted_at", null));
    getLink.clear();
    await log({ actor: "teacher", action: "link_toggled", teacherId: u.id, linkId: b.id, meta: { active: b.active } });
    return Response.json({ ok: true });
  }

  // Xóa mềm: giữ liên kết, phiên, tin nhắn, điểm trong DB (không bao giờ xóa cứng).
  check(await db.from("public_links").update({ deleted_at: new Date().toISOString() } as never).eq("id", b.id).eq("teacher_id", u.id).is("deleted_at", null));
  await log({ actor: "teacher", action: "link_deleted", teacherId: u.id, meta: { id: b.id } });
  getLink.clear();
  return Response.json({ ok: true });
});
