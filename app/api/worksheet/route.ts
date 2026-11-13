import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { check } from "@/lib/db";
import { admin } from "@/lib/supabase/admin";
import { llmCfg } from "@/lib/teacher";
import { getLink } from "@/lib/links";
import { parseProblems, type Problem } from "@/lib/schema/problem";
import { checkpoints } from "@/lib/chat/progress";
import { sweep } from "@/lib/sweep";
import { log } from "@/lib/log";
import { failResponse, reportError, watchdog, type Trace } from "@/lib/errors";
import { clientIp, limited } from "@/lib/ratelimit";
import { studentKey } from "@/lib/stats";
import { scrub } from "@/lib/pii";
import { aiJudge, gradeWorksheet, wsScore, type StepResult } from "@/lib/worksheet/grade";
import { HINT_LEVELS, wsAnswer, wsHint } from "@/lib/worksheet/view";
import { ASK_LIMIT, ASK_MAX, wsAsk } from "@/lib/worksheet/ask";

// Chế độ "làm theo bước rồi nộp cả bài": luồng RIÊNG, không dùng /api/chat. Cùng bảng chat_sessions (mode = "worksheet") nên thống kê, học sinh, dọn phiên bỏ dở dùng chung.
// Lưu trữ: progress = mặt nạ bước đã ĐÚNG (khóa), revealed = mặt nạ bước đã xem đáp án (0 điểm), struggled = bước gặp khó;
// đáp án đã nộp nằm trong messages.meta.ws, kết quả chấm trong messages.meta.results, hành vi (mở gợi ý, xem đáp án, hỏi) ghi vào activity_logs.

const who = { studentName: z.string().trim().min(2).max(60), studentClass: z.string().trim().min(1).max(10) };
const slug = z.string().min(4);
const sid = z.string().uuid();
const ANSWER_MAX = 500; // khớp giới hạn ô nhập ở trình duyệt
const WHOLE_MAX = 3000; // ô nhập cả bài (kiểu "whole")
// Kiểu nhập: steps = mỗi bước một ô (answers[]); whole = cả bài một ô (whole). Học sinh chọn, khóa sau lần nộp đầu.
const style = z.enum(["steps", "whole"]).default("steps");
const wholeText = z.string().max(WHOLE_MAX).default("");
const stepAnswers = z.array(z.string().max(ANSWER_MAX)).max(31).default([]);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), slug, problemCode: z.string(), ...who }),
  z.object({ action: z.literal("resume_check"), slug, problemCode: z.string(), ...who }),
  z.object({ action: z.literal("resume"), slug, sessionId: sid, ...who }),
  z.object({ action: z.literal("abandon"), slug, sessionId: sid, ...who }),
  z.object({ action: z.literal("hint"), slug, sessionId: sid, step: z.number().int().min(0).max(30), level: z.number().int().min(1).max(HINT_LEVELS) }),
  z.object({ action: z.literal("reveal"), slug, sessionId: sid, step: z.number().int().min(0).max(30) }),
  z.object({ action: z.literal("ask"), slug, sessionId: sid, step: z.number().int().min(0).max(30), text: z.string().trim().min(1).max(ASK_MAX) }),
  z.object({ action: z.literal("submit"), slug, sessionId: sid, style, answers: stepAnswers, whole: wholeText }),
  z.object({ action: z.literal("draft"), slug, sessionId: sid, style, answers: stepAnswers, whole: wholeText }), // lưu nháp khi rời ô nhập, không gọi AI
  z.object({ action: z.literal("survey"), slug, sessionId: sid, likert: z.number().int().min(1).max(5).optional(), confidence: z.number().int().min(1).max(5).optional() }),
]);

export const maxDuration = 60;

const MAX_SESSIONS_PER_DAY = 30;
const MAX_SESSIONS_PER_LINK_PER_DAY = 2000;
const MAX_SUBMITS = 40; // số lần nộp tối đa mỗi phiên
const MODE = "worksheet";

const err = (error: string, status = 400) => Response.json({ error }, { status });
const bitsOf = (mask: number, n: number) => Array.from({ length: n }, (_, i) => i).filter((i) => mask >> i & 1);

export async function POST(req: Request) {
  const tr: Trace = { actor: "student" }, t0 = Date.now();
  const stop = watchdog("/api/worksheet", tr);
  try {
    return await handle(req, tr);
  } catch (e) {
    return failResponse(e, "student", "/api/worksheet", { teacherId: tr.teacherId, linkId: tr.linkId, meta: { action: tr.action, ms: Date.now() - t0 } });
  } finally {
    stop();
  }
}

type Sess = { id: string; link_id: string; anon_id: string; progress: number; revealed: number; struggled: number; hint_level: number; status: string; started_at: string; problem_code: string; problem_snapshot?: unknown };

async function handle(req: Request, tr: Trace) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return err("Yêu cầu không hợp lệ.");
  const b = p.data;
  tr.action = b.action;

  const store = await cookies();
  let anon = store.get("fm_anon")?.value;
  if (!anon || !/^[0-9a-f-]{36}$/.test(anon)) anon = randomUUID();
  store.set("fm_anon", anon, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });

  const ip = clientIp(req);
  const day = new Date().toISOString().slice(0, 10);
  const ipKey = createHash("sha256").update(ip + day + (process.env.APP_SECRET ?? "")).digest("hex");
  // Mở gợi ý và xem đáp án là thao tác nhẹ, học sinh bấm nhiều: trần cao hơn chat; nộp bài và hỏi (gọi AI) có trần riêng theo phiên bên dưới.
  if (limited("wa" + anon, 90) || limited("wi" + ipKey, 3000) || (b.action === "start" && limited("ws" + ipKey, 300))) return err("Bạn gửi nhanh quá. Chờ một chút rồi thử lại.", 429);

  const db = admin();
  const link = await getLink(b.slug);
  const closed = !link ? null : !link.active ? "inactive" : link.expires_at && new Date(link.expires_at) < new Date() ? "expired" : null;
  if (!link || closed) {
    if (link && closed && !limited(`lc:${anon}:${link.id}`, 1, 600_000)) await log({ actor: "student", action: "link_closed", teacherId: link.teacher_id, anonId: anon, linkId: link.id, meta: { reason: closed } });
    return err("Liên kết này đã đóng. Hỏi giáo viên của em.", 404);
  }
  tr.teacherId = link.teacher_id; tr.linkId = link.id;
  const L = { actor: "student" as const, teacherId: link.teacher_id, anonId: anon, linkId: link.id };

  const pickProb = (s: { problem_snapshot?: unknown; problem_code: string }) => (s.problem_snapshot ? parseProblems([s.problem_snapshot]).ok[0] : undefined) ?? (link.problems.find((x) => x.id === s.problem_code) as Problem | undefined);

  // ---- Mở bài, làm tiếp, làm lại ----
  if (b.action === "resume_check" || b.action === "resume" || b.action === "abandon") {
    const code = studentKey(b.studentName.replace(/\s+/g, " "), b.studentClass.replace(/\s+/g, "").toUpperCase());
    const q = db.from("chat_sessions").select("id,problem_code,problem_snapshot,progress,revealed,draft,status,started_at").eq("link_id", link.id).eq("student_code", code).eq("mode", MODE).in("status", ["active", "abandoned"]).eq("restarted", false);
    if (b.action === "resume_check") {
      // Phiên mới nhất có gì đó để làm tiếp: đã nộp, đã xem đáp án, hoặc có bản nháp có nội dung. Phiên mở rồi bỏ (chưa làm gì, nháp trống) thì không hỏi.
      const { data } = await q.eq("problem_code", b.problemCode).order("started_at", { ascending: false }).limit(5);
      for (const s of (data ?? []) as (Pick<Sess, "id" | "problem_snapshot" | "problem_code" | "progress" | "revealed" | "started_at"> & { draft?: Draft | null })[]) {
        const pr = pickProb(s);
        if (!pr) continue;
        const n = checkpoints(pr).length, locked = s.progress ?? 0;
        const wholeDraft = s.draft?.style === "whole";
        const filled = wholeDraft ? (s.draft?.whole?.trim() ? 1 : 0) : draftAnswers(s.draft, n).filter((a, i) => !(locked >> i & 1) && a.trim()).length;
        const { data: ms } = await db.from("messages").select("ts").eq("session_id", s.id).eq("role", "student").order("id", { ascending: false }).limit(1);
        const last = (ms as { ts: string }[] | null)?.[0]?.ts;
        if (!last && !s.revealed && !filled) continue;
        return Response.json({ resume: { sessionId: s.id, done: bitsOf(locked, n).length, filled, total: n, style: wholeDraft ? "whole" : "steps", lastAt: s.draft?.at ?? last ?? s.started_at } });
      }
      return Response.json({});
    }
    const { data } = await q.eq("id", b.sessionId).maybeSingle();
    const s = data as (Pick<Sess, "id" | "problem_snapshot" | "problem_code" | "progress" | "revealed"> & { draft?: Draft | null }) | null;
    if (!s) return err("Không tìm thấy bài làm dở.", 404);
    if (b.action === "abandon") {
      check(await db.from("chat_sessions").update({ restarted: true } as never).eq("id", s.id));
      check(await db.from("chat_sessions").update({ status: "abandoned", ended_at: new Date().toISOString() } as never).eq("id", s.id).eq("status", "active"));
      return Response.json({ ok: true });
    }
    const pr = pickProb(s);
    if (!pr) return err("Không tìm thấy bài.", 404);
    check(await db.from("chat_sessions").update({ status: "active", ended_at: null, anon_id: anon } as never).eq("id", s.id)); // làm tiếp từ trình duyệt khác: phiên chuyển cho trình duyệt này
    return Response.json({ sessionId: s.id, ...(await state(s.id, s.progress ?? 0, s.revealed ?? 0, checkpoints(pr).length, s.draft)) });
  }

  if (b.action === "start") {
    const prob = link.problems.find((x) => x.id === b.problemCode);
    if (!prob) return err("Không tìm thấy bài.", 404);
    if (!prob.solution_steps.length) return err("Bài này chưa sẵn sàng. Báo giáo viên của em.", 409);
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [cfg, { count: today }, { count: linkToday }] = await Promise.all([
      llmCfg(link.teacher_id),
      db.from("chat_sessions").select("id", { count: "exact", head: true }).eq("anon_id", anon).gte("started_at", since),
      db.from("chat_sessions").select("id", { count: "exact", head: true }).eq("link_id", link.id).gte("started_at", since),
    ]);
    if (!cfg) return notReady(link, anon);
    if ((linkToday ?? 0) >= MAX_SESSIONS_PER_LINK_PER_DAY) return err("Liên kết này đã đạt giới hạn lượt dùng hôm nay. Báo giáo viên của em.", 429);
    if ((today ?? 0) >= MAX_SESSIONS_PER_DAY) return err("Hôm nay em đã làm nhiều bài rồi. Nghỉ một chút, mai làm tiếp nhé.", 429);
    sweep();
    const { data: seq } = await db.rpc("next_seq", { p_link: link.id } as never);
    const name = b.studentName.replace(/\s+/g, " "), cls = b.studentClass.replace(/\s+/g, "").toUpperCase(), code = studentKey(name, cls);
    const { data: s, error } = await db.from("chat_sessions").insert({ link_id: link.id, anon_id: anon, seq: (seq as number | null) ?? 1, problem_code: prob.id, student_code: code, student_name: name, student_class: cls, mode: MODE, hint_level: 0, problem_snapshot: prob } as never).select("id,seq").single();
    if (error || !s) throw new Error("Không tạo được phiên làm bài: " + (error?.message ?? "rỗng"));
    const up = await db.from("students").upsert({ teacher_id: link.teacher_id, code, name, class: cls, last_seen_at: new Date().toISOString(), deleted_at: null } as never);
    if (up.error) await reportError(new Error("Lỗi cơ sở dữ liệu: " + up.error.message), "lưu học sinh (upsert)", { ...L });
    const row = s as { id: string; seq: number };
    await log({ ...L, action: "chat_session_started", meta: { problem: prob.id, seq: row.seq, mode: MODE } });
    return Response.json({ sessionId: row.id });
  }

  // ---- Các thao tác trong một phiên ----
  const { data: sd } = await db.from("chat_sessions").select("id,link_id,anon_id,progress,revealed,struggled,hint_level,status,started_at,problem_code,problem_snapshot").eq("id", b.sessionId).eq("link_id", link.id).eq("anon_id", anon).eq("mode", MODE).maybeSingle();
  const sess = sd as Sess | null;
  if (!sess) return err("Phiên làm bài không tồn tại.", 404);
  const prob = pickProb(sess);
  if (!prob) return err("Không tìm thấy bài.", 404);
  const cps = checkpoints(prob), n = cps.length;

  if (b.action === "survey") {
    const upd = { ...(b.likert && { survey_likert: b.likert }), ...(b.confidence && { confidence: b.confidence }) };
    if (!Object.keys(upd).length) return err("Yêu cầu không hợp lệ.");
    check(await db.from("session_evals").update(upd as never).eq("session_id", sess.id)); // bản chấm đã ghi đồng bộ lúc nộp đúng hết, không phải chờ
    await log({ ...L, action: "survey_submitted", meta: { likert: b.likert, confidence: b.confidence } });
    return Response.json({ ok: true });
  }

  if (sess.status !== "active") return err("Bài này đã kết thúc.", 409);

  if (b.action === "draft") {
    // Nháp = ảnh chụp đáp án mọi bước lúc rời ô nhập; ghi đè cột draft (không sinh dòng mới, không gọi AI). Nháp trống hoàn toàn thì không tính là làm dở (xem resume_check).
    if (b.style === "steps" && b.answers.length !== n) return err("Bản nháp không khớp số bước. Tải lại trang rồi thử lại.");
    if (limited(`wd:${sess.id}`, 60, 60_000)) return err("Lưu nháp quá nhanh. Chờ một chút nhé.", 429);
    const at = new Date().toISOString();
    const draft = b.style === "whole" ? { style: "whole", whole: scrub(b.whole).slice(0, WHOLE_MAX), at } : { style: "steps", answers: b.answers.map((a) => scrub(a).slice(0, ANSWER_MAX)), at };
    check(await db.from("chat_sessions").update({ draft } as never).eq("id", sess.id));
    return Response.json({ ok: true });
  }

  if (b.action === "hint" || b.action === "reveal" || b.action === "ask") {
    if (b.step >= n) return err("Yêu cầu không hợp lệ.");
    if (sess.progress >> b.step & 1) return err("Bước này bạn đã làm đúng rồi.", 409);
    const bit = 1 << b.step;
    if (b.action === "hint") {
      const text = wsHint(prob, b.step, b.level);
      await Promise.all([
        log({ ...L, action: "ws_hint", meta: { session: sess.id, step: b.step + 1, level: b.level } }),
        db.from("chat_sessions").update({ struggled: sess.struggled | bit, hint_level: Math.max(sess.hint_level ?? 0, b.level) } as never).eq("id", sess.id).then(check),
      ]);
      return Response.json({ text });
    }
    if (b.action === "reveal") {
      const first = !(sess.revealed & bit);
      if (first) {
        await Promise.all([
          log({ ...L, action: "ws_reveal", meta: { session: sess.id, step: b.step + 1 } }),
          db.from("chat_sessions").update({ revealed: sess.revealed | bit, struggled: sess.struggled | bit } as never).eq("id", sess.id).then(check),
        ]);
      }
      return Response.json({ text: wsAnswer(prob, b.step), revealed: sess.revealed | bit });
    }
    // ask
    const cfg = await llmCfg(link.teacher_id);
    if (!cfg) return notReady(link, anon);
    const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("session_id", sess.id).eq("role", "student").like("content", "[Hỏi bước %");
    if ((count ?? 0) >= ASK_LIMIT) return err(`Mỗi bài chỉ hỏi tối đa ${ASK_LIMIT} câu. Em mở các gợi ý của bước nhé.`, 429);
    const clean = scrub(b.text);
    const r = await wsAsk(cfg, prob, b.step, clean);
    check(await db.from("messages").insert([
      { session_id: sess.id, role: "student", content: `[Hỏi bước ${b.step + 1}] ${clean}`, meta: { kind: "ws_ask_q" } }, // chèn nhiều dòng cùng lúc: dòng thiếu meta bị ghi null và vi phạm not-null
      { session_id: sess.id, role: "bot", content: r.reply, step: b.step + 1, meta: { kind: "ws_ask", blocked: r.blocked } },
    ] as never));
    await Promise.all([
      log({ ...L, action: "ws_ask", meta: { session: sess.id, step: b.step + 1, blocked: r.blocked } }),
      db.from("chat_sessions").update({ struggled: sess.struggled | bit } as never).eq("id", sess.id).then(check),
      r.blocked ? log({ actor: "system", action: "answer_leak_blocked", teacherId: link.teacher_id, anonId: anon, linkId: link.id }) : null,
    ]);
    return Response.json({ reply: r.reply });
  }

  // submit
  const whole = b.style === "whole";
  if (!whole && b.answers.length !== n) return err("Bài nộp không khớp số bước. Tải lại trang rồi thử lại.");
  if (whole && !b.whole.trim()) return err("Em chưa viết bài giải. Viết lời giải vào ô rồi mới nộp được.");
  if (limited(`wsub:${sess.id}`, 1, 3000)) return err("Bạn gửi nhanh quá. Chờ một chút rồi nộp lại nhé.", 429);
  const cfg = await llmCfg(link.teacher_id);
  if (!cfg) return notReady(link, anon);
  const { count: prevSubmits } = await db.from("messages").select("id", { count: "exact", head: true }).eq("session_id", sess.id).eq("role", "student").like("content", "Nộp lần %");
  const attempt = (prevSubmits ?? 0) + 1;
  if (attempt > MAX_SUBMITS) return err("Bạn đã nộp quá nhiều lần. Báo giáo viên của em.", 429);
  const locked = sess.progress ?? 0;
  const wholeClean = whole ? scrub(b.whole).trim() : "";
  const answers = whole ? Array.from({ length: n }, () => wholeClean) : b.answers.map((a) => scrub(a).trim()); // cả bài: mọi bước cùng một văn bản, hàm chấm tự tìm phần của từng bước
  const empty = Array.from({ length: n }, (_, i) => i).filter((i) => !(locked >> i & 1) && !answers[i]);
  if (empty.length) return err(`Bước ${empty.map((i) => i + 1).join(", ")} chưa có đáp án. Điền đủ các bước rồi mới nộp được.`);

  const tm: Record<string, number> = {};
  const t0 = Date.now();
  const results = await gradeWorksheet(prob, answers, locked, aiJudge(cfg, prob, (k, ms) => { tm[k] = (tm[k] ?? 0) + ms; }, whole), whole);
  tm.total = Date.now() - t0;
  const okMask = results.filter((r) => r.ok).reduce((m, r) => m | 1 << r.step, 0);
  const progress = locked | okMask;
  const done = bitsOf(progress, n).length >= n;
  const right = bitsOf(progress, n).length;
  const wrongBits = results.filter((r) => !r.ok && !r.unjudged).reduce((m, r) => m | 1 << r.step, 0);

  const summary = `Lần ${attempt}: đúng ${right}/${n} bước.${results.filter((r) => !r.ok).map((r) => ` Bước ${r.step + 1}: ${r.note}`).join("")}`;
  const text = whole ? `Nộp lần ${attempt} (cả bài)\n${wholeClean}` : [`Nộp lần ${attempt}`, ...answers.map((a, i) => `Bước ${i + 1}${locked >> i & 1 ? " (đã đúng)" : ""}: ${a}`)].join("\n");
  check(await db.from("messages").insert([
    { session_id: sess.id, role: "student", content: text, meta: { ws: whole ? { attempt, style: "whole", whole: wholeClean } : { attempt, style: "steps", answers } } },
    { session_id: sess.id, role: "bot", content: summary, step: done ? 5 : null, meta: { kind: done ? "done" : "ws_result", results, ai_parts: tm } },
  ] as never));
  check(await db.from("chat_sessions").update({ draft: null, progress, struggled: sess.struggled | wrongBits, step: done ? 5 : 1 + Math.min(3, Math.floor((right / n) * 4)) } as never).eq("id", sess.id));
  await log({ ...L, action: "ws_submit", meta: { session: sess.id, attempt, style: b.style, right, total: n, wrong: bitsOf(wrongBits, n).map((i) => i + 1), ms: tm } });

  let score: ReturnType<typeof wsScore> | undefined;
  if (done) score = await finishWs(sess, prob, link.teacher_id, anon, link.id, progress);
  return Response.json({ attempt, results, locked: bitsOf(progress, n), done, ...(score && { own: score.own, total: n }) }, { headers: { "Server-Timing": Object.entries(tm).map(([k, v]) => `${k};dur=${v}`).join(", ") } });
}

// Trạng thái để làm tiếp: đáp án lần nộp gần nhất, kết quả chấm gần nhất, bước đã khóa, bước đã xem đáp án.
async function state(sessionId: string, progress: number, revealed: number, n: number, draft?: Draft | null) {
  const db = admin();
  const [{ data: st }, { data: bt }] = await Promise.all([
    db.from("messages").select("meta").eq("session_id", sessionId).eq("role", "student").not("meta->ws", "is", null).order("id", { ascending: false }).limit(1),
    db.from("messages").select("meta").eq("session_id", sessionId).eq("role", "bot").eq("meta->>kind", "ws_result").order("id", { ascending: false }).limit(1),
  ]);
  const lastWs = (st as { meta: { ws?: { answers?: string[]; style?: string; whole?: string } } }[] | null)?.[0]?.meta.ws;
  const answers = (lastWs?.answers ?? []) as string[];
  const results = ((bt as { meta: { results?: StepResult[] } }[] | null)?.[0]?.meta.results ?? []) as StepResult[];
  // Bước chưa khóa lấy bản nháp mới nhất (nháp ghi sau lần nộp gần nhất, nộp xong thì nháp được xóa); bước đã khóa giữ đáp án đã nộp.
  const dr = draftAnswers(draft, n);
  const style = draft?.style ?? lastWs?.style ?? "steps";
  if (style === "whole") return { style, whole: draft?.whole ?? lastWs?.whole ?? "", locked: bitsOf(progress, n), revealed: bitsOf(revealed, n), answers: Array.from({ length: n }, () => ""), results: results.filter((r) => !(progress >> r.step & 1)) };
  return { style, whole: "", locked: bitsOf(progress, n), revealed: bitsOf(revealed, n), answers: Array.from({ length: n }, (_, i) => (progress >> i & 1) || !draft ? (answers[i] ?? "") : dr[i]), results: results.filter((r) => !(progress >> r.step & 1)) };
}

type Draft = { style?: string; answers?: string[]; whole?: string; at?: string };
const draftAnswers = (d: Draft | null | undefined, n: number) => Array.from({ length: n }, (_, i) => (typeof d?.answers?.[i] === "string" ? d!.answers![i] : ""));

// Nộp đúng hết: chấm điểm bằng luật (không gọi AI), ghi session_evals và đóng phiên. Bước đã xem đáp án 0 điểm.
async function finishWs(s: Sess, p: Problem, teacherId: string, anon: string, linkId: string, progress: number) {
  const db = admin();
  const n = checkpoints(p).length;
  const sc = wsScore(n, progress, s.revealed ?? 0);
  const { count: hints } = await db.from("activity_logs").select("id", { count: "exact", head: true }).eq("action", "ws_hint").contains("meta", { session: s.id });
  const duration = Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000);
  check(await db.from("session_evals").upsert({
    session_id: s.id, identify: sc.identify, plan: sc.plan, calculate: sc.calculate, explain: sc.explain, total: sc.total, final_correct: sc.finalCorrect,
    max_hint_level: Math.max(1, s.hint_level ?? 1), hint_count: hints ?? 0, errors: [], duration_s: duration, gaps: [],
  } as never, { onConflict: "session_id", ignoreDuplicates: true }));
  check(await db.from("chat_sessions").update({ status: "done", ended_at: new Date().toISOString() } as never).eq("id", s.id));
  await log({ actor: "system", action: "eval_done", teacherId, anonId: anon, linkId, meta: { total: sc.total, revealed: bitsOf(s.revealed ?? 0, n).length } });
  await log({ actor: "student", action: "chat_session_ended", teacherId, anonId: anon, linkId });
  return sc;
}

async function notReady(link: { id: string; teacher_id: string }, anon: string) {
  if (!limited(`nr:${link.id}`, 1, 600_000)) await reportError(new Error("Chatbot chưa sẵn sàng: giáo viên chưa nhập API key"), "/api/worksheet (chưa có key)", { teacherId: link.teacher_id, linkId: link.id, anonId: anon, actor: "student", kind: "config" });
  return err("Chatbot chưa sẵn sàng. Nhờ giáo viên kiểm tra cài đặt.", 503);
}
