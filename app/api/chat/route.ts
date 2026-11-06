import { check } from "@/lib/db";
import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { llmCfg } from "@/lib/teacher";
import { finish, openingTurn, turn, type Session } from "@/lib/chat/engine";
import { parseProblems, type Problem } from "@/lib/schema/problem";
import { log } from "@/lib/log";
import { failResponse } from "@/lib/errors";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), slug: z.string().min(4), problemCode: z.string() }),
  z.object({ action: z.literal("message"), slug: z.string().min(4), sessionId: z.string().uuid(), text: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal("end"), slug: z.string().min(4), sessionId: z.string().uuid() }),
  z.object({ action: z.literal("survey"), slug: z.string().min(4), sessionId: z.string().uuid(), likert: z.number().int().min(1).max(5) }),
]);

// ponytail: giới hạn trong bộ nhớ 1 instance (IP chỉ băm, không lưu DB). Dùng Redis/Upstash khi chạy nhiều instance.
const hits = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > 30;
}

const err = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    return failResponse(e, "student", "/api/chat");
  }
}

async function handle(req: Request) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return err("Yêu cầu không hợp lệ.");
  const b = p.data;

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  if (limited(createHash("sha256").update(ip + day + (process.env.APP_SECRET ?? "")).digest("hex"))) return err("Bạn gửi nhanh quá. Chờ một chút rồi thử lại.", 429);

  const db = admin();
  const { data: l } = await db.from("public_links").select("*").eq("slug", b.slug).maybeSingle();
  const link = l as { id: string; teacher_id: string; active: boolean; expires_at: string | null; max_messages: number; problems_snapshot: unknown } | null;
  if (!link || !link.active || (link.expires_at && new Date(link.expires_at) < new Date())) return err("Liên kết này đã đóng. Hỏi giáo viên của em.", 404);

  const store = await cookies();
  let anon = store.get("fm_anon")?.value;
  if (!anon || !/^[0-9a-f-]{36}$/.test(anon)) anon = randomUUID();
  store.set("fm_anon", anon, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });

  const problems = parseProblems(link.problems_snapshot).ok;

  if (b.action === "start") {
    const prob = problems.find((x) => x.id === b.problemCode);
    if (!prob) return err("Không tìm thấy bài.", 404);
    const cfg = await llmCfg(link.teacher_id);
    if (!cfg) return err("Chatbot chưa sẵn sàng. Nhờ giáo viên kiểm tra cài đặt.", 503);
    const { count } = await db.from("chat_sessions").select("id", { count: "exact", head: true }).eq("link_id", link.id);
    const { data: s, error } = await db.from("chat_sessions").insert({ link_id: link.id, anon_id: anon, seq: (count ?? 0) + 1, problem_code: prob.id } as never).select("*").single();
    if (error || !s) throw new Error("Không tạo được phiên chat: " + (error?.message ?? "rỗng"));
    const sess = s as Session & { seq: number };
    await log({ actor: "student", action: "chat_session_started", teacherId: link.teacher_id, anonId: anon, linkId: link.id, meta: { problem: prob.id, seq: sess.seq } });
    try {
      const r = prob.statement ? await openingTurn(sess, prob, link.teacher_id) : await turn(cfg, sess, prob, null, link.teacher_id);
      return Response.json({ sessionId: sess.id, ...r });
    } catch (e) {
      return geminiFail(e, link.teacher_id, anon, link.id);
    }
  }

  const { data: sd } = await db.from("chat_sessions").select("*").eq("id", b.sessionId).eq("link_id", link.id).eq("anon_id", anon).maybeSingle();
  const sess = sd as (Session & { problem_code: string }) | null;
  if (!sess) return err("Phiên chat không tồn tại.", 404);
  const prob = problems.find((x) => x.id === sess.problem_code) as Problem;

  if (b.action === "survey") {
    check(await db.from("session_evals").update({ survey_likert: b.likert } as never).eq("session_id", sess.id));
    await log({ actor: "student", action: "survey_submitted", teacherId: link.teacher_id, anonId: anon, linkId: link.id, meta: { likert: b.likert } });
    return Response.json({ ok: true });
  }

  const cfg = await llmCfg(link.teacher_id);
  if (!cfg) return err("Chatbot chưa sẵn sàng. Nhờ giáo viên kiểm tra cài đặt.", 503);

  try {
    if (b.action === "end") {
      if (sess.status === "active") {
        await finish(cfg, sess, prob, link.teacher_id);
      }
      return Response.json({ ok: true, done: true });
    }
    if (sess.status !== "active") return err("Bài này đã kết thúc.", 409);
    const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("session_id", sess.id).eq("role", "student");
    if ((count ?? 0) >= link.max_messages) return err("Đã đủ số tin nhắn cho bài này. Bấm Kết thúc bài.", 429);
    return Response.json(await turn(cfg, sess, prob, b.text, link.teacher_id));
  } catch (e) {
    return geminiFail(e, link.teacher_id, anon, link.id);
  }
}

function geminiFail(e: unknown, teacherId: string, anon: string, linkId: string) {
  return failResponse(e, "student", "/api/chat", { teacherId, anonId: anon, linkId });
}
