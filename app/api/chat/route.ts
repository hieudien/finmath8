import { check } from "@/lib/db";
import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { llmCfg, teacherMode } from "@/lib/teacher";
import { getLink } from "@/lib/links";
import { finish, openingTurn, turn, type Session, type Tm } from "@/lib/chat/engine";
import { quizPick } from "@/lib/chat/quiz";
import { stepAsk, stepHint, stepsOpening, stepTurn } from "@/lib/chat/steps";
import { modeFor } from "@/lib/modes";
import { type Problem } from "@/lib/schema/problem";
import { log } from "@/lib/log";
import { failResponse } from "@/lib/errors";
import { clientIp, limited } from "@/lib/ratelimit";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), slug: z.string().min(4), problemCode: z.string(), studentCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9._-]{1,20}$/), studentName: z.string().trim().min(2).max(60) }),
  z.object({ action: z.literal("message"), slug: z.string().min(4), sessionId: z.string().uuid(), text: z.string().trim().min(1).max(500), ask: z.boolean().optional() }), // ask: câu hỏi "Em chưa hiểu" (kiểu từng bước)
  z.object({ action: z.literal("pick"), slug: z.string().min(4), sessionId: z.string().uuid(), choice: z.string().min(1).max(300) }), // chỉ kiểu "quiz"
  z.object({ action: z.literal("end"), slug: z.string().min(4), sessionId: z.string().uuid() }),
  z.object({ action: z.literal("hint"), slug: z.string().min(4), sessionId: z.string().uuid() }), // kiểu "từng bước" và "quiz"
  z.object({ action: z.literal("survey"), slug: z.string().min(4), sessionId: z.string().uuid(), likert: z.number().int().min(1).max(5).optional(), confidence: z.number().int().min(1).max(5).optional() }),
]);

export const maxDuration = 60; // AI có hạn chót 40 giây, chừa thêm thời gian ghi DB

const MAX_SESSIONS_PER_DAY = 30; // mỗi trình duyệt (anon_id): học sinh thật chỉ dùng khoảng 10 phiên/ngày, chặn ai đó tạo phiên vô hạn để đốt key của giáo viên

const MAX_SESSIONS_PER_LINK_PER_DAY = 2000; // trần cả liên kết: lớp thật ~40 em x ~10 phiên; chặn kẻ xóa cookie để vượt giới hạn từng trình duyệt


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

  const store = await cookies();
  let anon = store.get("fm_anon")?.value;
  if (!anon || !/^[0-9a-f-]{36}$/.test(anon)) anon = randomUUID();
  store.set("fm_anon", anon, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });

  // Giới hạn theo học sinh (cookie) là chính. Giới hạn theo IP chỉ để chặn kẻ xóa cookie liên tục; cao vì cả trường dùng chung 1 IP.
  const ip = clientIp(req);
  const day = new Date().toISOString().slice(0, 10);
  const ipKey = createHash("sha256").update(ip + day + (process.env.APP_SECRET ?? "")).digest("hex");
  if (limited("a" + anon, 30) || limited("i" + ipKey, 1500) || (b.action === "start" && limited("s" + ipKey, 300))) return err("Bạn gửi nhanh quá. Chờ một chút rồi thử lại.", 429);

  const db = admin();
  const link = await getLink(b.slug);
  if (!link || !link.active || (link.expires_at && new Date(link.expires_at) < new Date())) return err("Liên kết này đã đóng. Hỏi giáo viên của em.", 404);
  const problems = link.problems;

  if (b.action === "start") {
    const prob = problems.find((x) => x.id === b.problemCode);
    if (!prob) return err("Không tìm thấy bài.", 404);
    // Lời chào có sẵn không gọi AI; đề không có statement mới gọi AI để mở bài. Cả hai cần key hợp lệ.
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [cfg, { count: today }, { count: linkToday }] = await Promise.all([
      llmCfg(link.teacher_id),
      db.from("chat_sessions").select("id", { count: "exact", head: true }).eq("anon_id", anon).gte("started_at", since),
      db.from("chat_sessions").select("id", { count: "exact", head: true }).eq("link_id", link.id).gte("started_at", since),
    ]);
    if (!cfg) return err("Chatbot chưa sẵn sàng. Nhờ giáo viên kiểm tra cài đặt.", 503);
    if ((linkToday ?? 0) >= MAX_SESSIONS_PER_LINK_PER_DAY) return err("Liên kết này đã đạt giới hạn lượt dùng hôm nay. Báo giáo viên của em.", 429);
    if ((today ?? 0) >= MAX_SESSIONS_PER_DAY) return err("Hôm nay em đã làm nhiều bài rồi. Nghỉ một chút, mai làm tiếp nhé.", 429);
    const { data: seq } = await db.rpc("next_seq", { p_link: link.id } as never); // sau khi qua mọi giới hạn, để số thứ tự không bị hụt
    // Kiểu tương tác ghim vào phiên lúc bắt đầu; đề thiếu lời giải từng bước thì chạy chat.
    const mode = modeFor(await teacherMode(link.teacher_id), prob);
    const { data: s, error } = await db.from("chat_sessions").insert({ link_id: link.id, anon_id: anon, seq: (seq as number | null) ?? 1, problem_code: prob.id, student_code: b.studentCode, student_name: b.studentName, mode, ...(mode !== "chat" && { hint_level: 0 }) } as never).select("*").single();
    if (error || !s) throw new Error("Không tạo được phiên chat: " + (error?.message ?? "rỗng"));
    const sess = s as Session & { seq: number };
    try {
      const [r] = await Promise.all([
        mode !== "chat" ? stepsOpening(sess, prob) : prob.statement ? openingTurn(sess, prob) : turn(cfg, sess, prob, null, link.teacher_id, []),
        log({ actor: "student", action: "chat_session_started", teacherId: link.teacher_id, anonId: anon, linkId: link.id, meta: { problem: prob.id, seq: sess.seq, mode } }),
      ]);
      return Response.json({ sessionId: sess.id, mode, ...r });
    } catch (e) {
      return geminiFail(e, link.teacher_id, anon, link.id);
    }
  }

  // Phiên, cấu hình AI và các tin của phiên độc lập nhau: đọc song song một lượt thay vì nối tiếp.
  const tm: Tm = {};
  const t0 = Date.now();
  const [{ data: sd }, cfg, { data: msgs }] = await Promise.all([
    db.from("chat_sessions").select("*").eq("id", b.sessionId).eq("link_id", link.id).eq("anon_id", anon).maybeSingle(),
    b.action === "survey" ? null : llmCfg(link.teacher_id),
    b.action === "message" || b.action === "pick" ? db.from("messages").select("role,content,hint_level,ts").eq("session_id", b.sessionId).order("id") : { data: null },
  ]);
  tm.db_pre = Date.now() - t0;
  const sess = sd as (Session & { problem_code: string }) | null;
  if (!sess) return err("Phiên chat không tồn tại.", 404);
  const prob = problems.find((x) => x.id === sess.problem_code) as Problem;

  if (b.action === "survey") {
    const upd = { ...(b.likert && { survey_likert: b.likert }), ...(b.confidence && { confidence: b.confidence }) };
    if (!Object.keys(upd).length) return err("Yêu cầu không hợp lệ.");
    // Bản chấm điểm được ghi ngầm sau lượt cuối (after): khảo sát đến sớm hơn thì chờ tối đa ~8 giây cho dòng chấm điểm xuất hiện.
    for (let i = 0; ; i++) {
      const { data, error } = await db.from("session_evals").update(upd as never).eq("session_id", sess.id).select("session_id");
      check({ error });
      if (data?.length || i >= 4) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    await log({ actor: "student", action: "survey_submitted", teacherId: link.teacher_id, anonId: anon, linkId: link.id, meta: { likert: b.likert, confidence: b.confidence } });
    return Response.json({ ok: true });
  }

  if (!cfg) return err("Chatbot chưa sẵn sàng. Nhờ giáo viên kiểm tra cài đặt.", 503);

  try {
    if (b.action === "end") {
      if (sess.status === "active") {
        await finish(cfg, sess, prob, link.teacher_id);
      }
      return Response.json({ ok: true, done: true });
    }
    if (sess.status !== "active") return err("Bài này đã kết thúc.", 409);
    const quiz = sess.mode === "quiz";
    const steps = sess.mode === "steps";
    if (b.action === "hint") return steps || quiz ? Response.json(await stepHint(cfg, sess, prob, link.teacher_id)) : err("Yêu cầu không hợp lệ.");
    if ((b.action === "pick") !== quiz) return err("Yêu cầu không hợp lệ.");
    // Một lần đọc (ở trên) cho cả giới hạn số tin, chống gửi dồn và ngữ cảnh của lượt này.
    const all = (msgs ?? []) as { role: "student" | "bot"; content: string; hint_level: number | null; ts: string }[];
    const said = all.filter((m) => m.role === "student");
    if (said.length >= link.max_messages) return err("Đã đủ số tin nhắn cho bài này. Bấm Kết thúc bài.", 429);
    // Chống gửi dồn: cách tin trước ít nhất 2 giây trong cùng phiên.
    const last = said.at(-1);
    if (last && Date.now() - new Date(last.ts).getTime() < 2000) return err("Bạn gửi nhanh quá. Chờ một chút rồi gửi lại nhé.", 429);
    if (b.action === "pick") {
      const r = await quizPick(cfg, sess, prob, b.choice, link.teacher_id);
      return r ? Response.json(r) : err("Yêu cầu không hợp lệ.");
    }
    if (b.ask && !steps) return err("Yêu cầu không hợp lệ.");
    const r = await (steps ? (b.ask ? stepAsk : stepTurn) : turn)(cfg, sess, prob, b.text, link.teacher_id, all, tm);
    tm.total = Date.now() - t0;
    return Response.json(r, { headers: { "Server-Timing": Object.entries(tm).map(([k, v]) => `${k};dur=${v}`).join(", ") } });
  } catch (e) {
    return geminiFail(e, link.teacher_id, anon, link.id);
  }
}

function geminiFail(e: unknown, teacherId: string, anon: string, linkId: string) {
  return failResponse(e, "student", "/api/chat", { teacherId, anonId: anon, linkId });
}
