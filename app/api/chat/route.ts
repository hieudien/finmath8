import { check } from "@/lib/db";
import { after } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { sweep } from "@/lib/sweep";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { llmCfg, withCtx } from "@/lib/teacher";
import { getLink } from "@/lib/links";
import { finish, type Session, type Tm } from "@/lib/chat/engine";
import { ASK, freeHint, freeOpening, freeTurn } from "@/lib/chat/free";
import { stepsGreeting } from "@/lib/chat/goals";
import { parseProblems, type Problem } from "@/lib/schema/problem";
import { log } from "@/lib/log";
import { failResponse, reportError, swallow, watchdog, type Trace } from "@/lib/errors";
import { clientIp, limited } from "@/lib/ratelimit";
import { studentKey } from "@/lib/stats";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), slug: z.string().min(4), problemCode: z.string(), studentName: z.string().trim().min(2).max(60), studentClass: z.string().trim().min(1).max(10) }),
  z.object({ action: z.literal("resume_check"), slug: z.string().min(4), problemCode: z.string(), studentName: z.string().trim().min(2).max(60), studentClass: z.string().trim().min(1).max(10) }), // có phiên làm dở của đúng học sinh + đề này không
  z.object({ action: z.literal("resume"), slug: z.string().min(4), sessionId: z.string().uuid(), studentName: z.string().trim().min(2).max(60), studentClass: z.string().trim().min(1).max(10) }), // làm tiếp phiên dở: trả lại tin cũ
  z.object({ action: z.literal("abandon"), slug: z.string().min(4), sessionId: z.string().uuid(), studentName: z.string().trim().min(2).max(60), studentClass: z.string().trim().min(1).max(10) }), // chọn "làm lại mới": đóng phiên dở cũ
  z.object({ action: z.literal("message"), slug: z.string().min(4), sessionId: z.string().uuid(), text: z.string().trim().min(1).max(500), ask: z.boolean().optional() }), // ask: câu hỏi "Em chưa hiểu"
  z.object({ action: z.literal("end"), slug: z.string().min(4), sessionId: z.string().uuid() }),
  z.object({ action: z.literal("hint"), slug: z.string().min(4), sessionId: z.string().uuid() }),
]);

export const maxDuration = 60; // AI có hạn chót 40 giây, chừa thêm thời gian ghi DB


const err = (error: string, status = 400) => Response.json({ error }, { status });

// Bị chặn giới hạn (429): ghi nhật ký cho giáo viên thấy lớp nào chạm trần. Mỗi học sinh mỗi luật chỉ ghi 1 lần mỗi 10 phút, tránh spam làm phình bảng.
async function denied(rule: string, slug: string, anon: string, message: string, link?: { id: string; teacher_id: string } | null) {
  link ??= await getLink(slug).catch(swallow("tìm liên kết khi từ chối", { actor: "student" }));
  if (link && !limited(`rl:${anon}:${rule}`, 1, 600_000)) await log({ actor: "student", action: "rate_limited", teacherId: link.teacher_id, anonId: anon, linkId: link.id, meta: { rule } });
  return err(message, 429);
}

export async function POST(req: Request) {
  const tr: Trace = { actor: "student" }, t0 = Date.now();
  const stop = watchdog("/api/chat", tr); // quá 55s chưa xong thì ghi trước khi hosting cắt
  try {
    return await handle(req, tr);
  } catch (e) {
    return failResponse(e, "student", "/api/chat", { teacherId: tr.teacherId, linkId: tr.linkId, meta: { action: tr.action, ms: Date.now() - t0 } });
  } finally {
    stop();
  }
}

async function handle(req: Request, tr: Trace) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return err("Yêu cầu không hợp lệ.");
  const b = p.data;
  tr.action = b.action;

  const store = await cookies();
  let anon = store.get("fm_anon")?.value;
  if (!anon || !/^[0-9a-f-]{36}$/.test(anon)) anon = randomUUID();
  store.set("fm_anon", anon, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });

  // Giới hạn theo học sinh (cookie) là chính. Giới hạn theo IP chỉ để chặn kẻ xóa cookie liên tục; cao vì cả trường dùng chung 1 IP.
  const ip = clientIp(req);
  const day = new Date().toISOString().slice(0, 10);
  const ipKey = createHash("sha256").update(ip + day + (process.env.APP_SECRET ?? "")).digest("hex");
  const rule = limited("a" + anon, 30) ? "anon" : limited("i" + ipKey, 1500) ? "ip" : b.action === "start" && limited("s" + ipKey, 300) ? "start_ip" : null;
  if (rule) return denied(rule, b.slug, anon, "Bạn gửi nhanh quá. Chờ một chút rồi thử lại.");

  const db = admin();
  const link = await getLink(b.slug);
  const closed = !link ? null : !link.active ? "inactive" : link.expires_at && new Date(link.expires_at) < new Date() ? "expired" : null;
  if (!link || closed) {
    // Slug không tồn tại thì bỏ qua (không có giáo viên nào để báo); liên kết có thật mà đã đóng thì ghi, mỗi học sinh 1 lần mỗi 10 phút.
    if (link && closed && !limited(`lc:${anon}:${link.id}`, 1, 600_000)) await log({ actor: "student", action: "link_closed", teacherId: link.teacher_id, anonId: anon, linkId: link.id, meta: { reason: closed } });
    return err("Liên kết này đã đóng. Hỏi giáo viên của em.", 404);
  }
  tr.teacherId = link.teacher_id; tr.linkId = link.id;
  const problems = link.problems;

  // Làm tiếp bài dở: khớp theo tên + lớp (không cần cùng trình duyệt), phiên "active" hoặc "abandoned" đều làm tiếp được.
  if (b.action === "resume_check" || b.action === "resume" || b.action === "abandon") {
    const code = studentKey(b.studentName.replace(/\s+/g, " "), b.studentClass.replace(/\s+/g, "").toUpperCase());
    const q = db.from("chat_sessions").select("id,problem_code,problem_snapshot,step,status,started_at").eq("link_id", link.id).eq("student_code", code).in("status", ["active", "abandoned"]).eq("restarted", false);
    if (b.action === "resume_check") {
      // Phiên mới nhất có tin của học sinh (phiên mở rồi bỏ, chưa nộp gì thì không có gì để làm tiếp); xem tối đa 5 phiên gần nhất.
      const { data } = await q.eq("problem_code", b.problemCode).order("started_at", { ascending: false }).limit(5);
      for (const s of (data ?? []) as { id: string; problem_snapshot?: unknown; started_at: string }[]) {
        const { data: ms } = await db.from("messages").select("role,ts").eq("session_id", s.id).order("id", { ascending: false });
        const rows = (ms ?? []) as { role: string; ts: string }[];
        const pr = (s.problem_snapshot ? parseProblems([s.problem_snapshot]).ok[0] : undefined) ?? problems.find((x) => x.id === b.problemCode);
        if (!pr || !rows.some((m) => m.role === "student")) continue;
        return Response.json({ resume: { sessionId: s.id, lastAt: rows[0].ts } });
      }
      return Response.json({});
    }
    const { data } = await q.eq("id", b.sessionId).maybeSingle();
    const s = data as { id: string; problem_snapshot?: unknown; problem_code: string } | null;
    if (!s) return err("Không tìm thấy bài làm dở.", 404);
    if (b.action === "abandon") {
      check(await db.from("chat_sessions").update({ restarted: true } as never).eq("id", s.id)); // không gợi ý làm tiếp nữa
      check(await db.from("chat_sessions").update({ status: "abandoned", ended_at: new Date().toISOString() } as never).eq("id", s.id).eq("status", "active"));
      return Response.json({ ok: true });
    }
    const pr = (s.problem_snapshot ? parseProblems([s.problem_snapshot]).ok[0] : undefined) ?? problems.find((x) => x.id === s.problem_code);
    if (!pr) return err("Không tìm thấy bài.", 404);
    check(await db.from("chat_sessions").update({ status: "active", ended_at: null } as never).eq("id", s.id));
    const { data: ms } = await db.from("messages").select("role,content").eq("session_id", s.id).order("id");
    return Response.json({ sessionId: s.id, msgs: ((ms ?? []) as { role: "student" | "bot"; content: string }[]).map((m) => ({ role: m.role, text: m.role === "student" && m.content.startsWith(ASK) ? `❓ ${m.content.slice(ASK.length)}` : m.content })) }); // giống tin hỏi lúc chat trực tiếp
  }

  if (b.action === "start") {
    const prob = problems.find((x) => x.id === b.problemCode);
    if (!prob) return err("Không tìm thấy bài.", 404);
    // Lời chào có sẵn không gọi AI; đề không có statement mới gọi AI để mở bài. Cả hai cần key hợp lệ.
    if (!(await llmCfg(link.teacher_id))) return notReady(link, anon);
    sweep(); // dọn phiên bỏ dở và nhật ký lỗi cũ sau khi trả phản hồi
    const { data: seq } = await db.rpc("next_seq", { p_link: link.id } as never); // sau khi qua mọi kiểm tra, để số thứ tự không bị hụt
    if (!prob.solution_steps.length && !Object.keys(prob.solution ?? {}).length) return err("Bài này chưa sẵn sàng. Báo giáo viên của em.", 409); // đề thiếu cả đáp án lẫn lời giải
    const name = b.studentName.replace(/\s+/g, " "), cls = b.studentClass.replace(/\s+/g, "").toUpperCase(), code = studentKey(name, cls);
    const { data: s, error } = await db.from("chat_sessions").insert({ link_id: link.id, anon_id: anon, seq: (seq as number | null) ?? 1, problem_code: prob.id, student_code: code, student_name: name, student_class: cls, hint_level: 0, problem_snapshot: prob } as never).select("*").single();
    if (error || !s) throw new Error("Không tạo được phiên chat: " + (error?.message ?? "rỗng"));
    // Học sinh có bảng riêng, sống sót khi xóa liên kết. Vào lại bằng cùng mã thì hiện lại (deleted_at = null).
    const up = await db.from("students").upsert({ teacher_id: link.teacher_id, code, name, class: cls, last_seen_at: new Date().toISOString(), deleted_at: null } as never);
    if (up.error) await reportError(new Error("Lỗi cơ sở dữ liệu: " + up.error.message), "lưu học sinh (upsert)", { teacherId: link.teacher_id, linkId: link.id, anonId: anon, actor: "student" });
    const sess = s as Session & { seq: number };
    try {
      const [r] = await Promise.all([
        freeOpening(sess, stepsGreeting()),
        log({ actor: "student", action: "chat_session_started", teacherId: link.teacher_id, anonId: anon, linkId: link.id, meta: { problem: prob.id, seq: sess.seq } }),
      ]);
      return Response.json({ sessionId: sess.id, ...r });
    } catch (e) {
      return geminiFail(e, link.teacher_id, anon, link.id);
    }
  }

  // Phiên, cấu hình AI và các tin của phiên độc lập nhau: đọc song song một lượt thay vì nối tiếp.
  const tm: Tm = {};
  const t0 = Date.now();
  const [{ data: sd }, cfg0, { data: msgs }] = await Promise.all([
    db.from("chat_sessions").select("*").eq("id", b.sessionId).eq("link_id", link.id).eq("anon_id", anon).maybeSingle(),
    llmCfg(link.teacher_id),
    b.action === "message" || b.action === "hint" ? db.from("messages").select("role,content,hint_level,ts,meta").eq("session_id", b.sessionId).order("id") : { data: null },
  ]);
  tm.db_pre = Date.now() - t0;
  const sess = sd as (Session & { problem_code: string; problem_snapshot?: unknown }) | null;
  if (!sess) return err("Phiên chat không tồn tại.", 404);
  // Phiên giữ bản đề lúc mở; phiên cũ (chưa có bản ghim) dùng đề của liên kết.
  const prob = (sess.problem_snapshot ? parseProblems([sess.problem_snapshot]).ok[0] : undefined) ?? (problems.find((x) => x.id === sess.problem_code) as Problem);

  if (!cfg0) return notReady(link, anon);
  const cfg = withCtx(cfg0, { sessionId: sess.id, problem: sess.problem_code, linkId: link.id, anonId: anon }); // token của phiên này ghi kèm phiên và đề

  try {
    if (b.action === "end") {
      if (sess.status === "active") {
        await finish(cfg, sess, prob, link.teacher_id);
      }
      return Response.json({ ok: true, done: true });
    }
    if (sess.status !== "active") return err("Bài này đã kết thúc.", 409);
    // Một lần đọc (ở trên) cho cả chống gửi dồn và ngữ cảnh của lượt này (gợi ý cũng cần xem bài làm vừa nộp).
    const all = (msgs ?? []) as { role: "student" | "bot"; content: string; hint_level: number | null; ts: string; meta?: { kind?: string } | null }[];
    if (b.action === "hint") return Response.json(await freeHint(cfg, sess, prob, link.teacher_id, all));
    const said = all.filter((m) => m.role === "student");
    // Chống gửi dồn: cách tin trước ít nhất 2 giây trong cùng phiên.
    const last = said.at(-1);
    if (last && Date.now() - new Date(last.ts).getTime() < 2000) return denied("too_fast", b.slug, anon, "Bạn gửi nhanh quá. Chờ một chút rồi gửi lại nhé.", link);
    // Trả lời dần dần (NDJSON, mỗi dòng một sự kiện): {t:"d",x} chữ mới; {t:"f",reply,done,wrong} kết thúc; {t:"e",error} lỗi giữa chừng.
    // Chấm điểm (finish) chạy ngầm sau khi luồng đóng, học sinh không phải đợi.
    let settle!: (r: { done: boolean } | null) => void;
    const settled = new Promise<{ done: boolean } | null>((res) => { settle = res; });
    const teacherId = link.teacher_id, linkId = link.id, ask = !!b.ask, text = b.text;
    after(async () => {
      const r = await settled;
      if (r?.done) await finish(cfg, sess, prob, teacherId).catch((e) => reportError(e, "chấm điểm (finish)", { teacherId, linkId, anonId: anon, actor: "system" }));
    });
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(ctl) {
        const send = (e: object) => { try { ctl.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { /* học sinh đã đóng trang: vẫn chạy tiếp để lưu tin bot */ } };
        try {
          const r = await freeTurn(cfg, sess, prob, text, teacherId, all, ask, tm, (x) => send({ t: "d", x }));
          tm.total = Date.now() - t0;
          send({ t: "f", reply: r.reply, done: r.done, wrong: r.wrong, step: r.step });
          settle({ done: r.done });
        } catch (e) {
          const res = await geminiFail(e, teacherId, anon, linkId);
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          send({ t: "e", error: j.error ?? "Có lỗi. Bạn thử gửi lại nhé." });
          settle(null);
        } finally {
          try { ctl.close(); } catch { /* đã đóng */ }
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
  } catch (e) {
    return geminiFail(e, link.teacher_id, anon, link.id);
  }
}

// Giáo viên chưa có API key hợp lệ nên học sinh không làm bài được: ghi vào nhật ký lỗi (mỗi liên kết 1 lần mỗi 10 phút) để giáo viên biết.
async function notReady(link: { id: string; teacher_id: string }, anon: string) {
  if (!limited(`nr:${link.id}`, 1, 600_000)) await reportError(new Error("Chatbot chưa sẵn sàng: giáo viên chưa nhập API key"), "/api/chat (chưa có key)", { teacherId: link.teacher_id, linkId: link.id, anonId: anon, actor: "student", kind: "config" });
  return err("Chatbot chưa sẵn sàng. Nhờ giáo viên kiểm tra cài đặt.", 503);
}

function geminiFail(e: unknown, teacherId: string, anon: string, linkId: string) {
  return failResponse(e, "student", "/api/chat", { teacherId, anonId: anon, linkId });
}
