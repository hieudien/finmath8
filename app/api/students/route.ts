import { z } from "zod";
import { randomBytes } from "node:crypto";
import { critTen, toTen } from "@/lib/score";
import { admin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { api, bad, requireUser } from "@/lib/auth";
import { askJson } from "@/lib/llm";
import { llmCfg } from "@/lib/teacher";
import { loadStudent } from "@/lib/students";
import { check } from "@/lib/db";
import { log } from "@/lib/log";

const UUID = z.string().uuid();
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("advise"), code: z.string().regex(/^[A-Z0-9._-]{1,80}$/) }),
  z.object({ action: z.literal("analyze_session"), id: UUID }),
  z.object({ action: z.literal("delete"), code: z.string().regex(/^[A-Z0-9._-]{1,80}$/) }),
  z.object({ action: z.enum(["share_get", "share_create", "share_revoke"]), code: z.string().regex(/^[A-Z0-9._-]{1,80}$/) }),
]);
const sessionOut = z.object({ summary: z.string().min(1), strengths: z.array(z.string()).max(5), weaknesses: z.array(z.string()).max(5), next_steps: z.array(z.string()).max(5) });

const SESSION_SYSTEM = `Bạn là trợ lý cho giáo viên Toán. Dưới đây là một phiên học sinh làm một bài với chatbot gợi mở: đề, các bước lời giải, điểm tự chấm (rubric 0–3: nhận diện, lập kế hoạch, tính toán, giải thích) nếu có, và hội thoại (HS = học sinh, Bot = chatbot). Hãy nhận xét riêng phiên này cho giáo viên: học sinh làm tốt ở đâu, yếu ở bước nào và vì sao, cần làm gì tiếp. Dựa đúng vào hội thoại, không bịa. Phiên làm dở hoặc ít tin thì nói rõ là nhận xét sơ bộ. Bước chatbot phải hiện lời giải thì học sinh chưa tự làm được: coi là điểm yếu. Viết tiếng Việt, ngắn gọn, cụ thể, công thức đặt trong $...$ theo LaTeX.
Chỉ trả JSON {"summary":"2-3 câu tổng quát","strengths":[điểm làm tốt],"weaknesses":[điểm yếu, nêu bước nào],"next_steps":[việc giáo viên nên làm với học sinh này sau phiên]}.`;
const out = z.object({ weak_areas: z.array(z.string()).max(6), suggestions: z.array(z.string()).max(6), practice: z.array(z.string()).max(5), step_review: z.array(z.object({ step: z.string().min(1), review: z.string().min(1) })).max(6).default([]) });

const SYSTEM = `Bạn là trợ lý cho giáo viên Toán. Dựa trên số liệu một học sinh làm bài với chatbot gợi mở (rubric 0–3: nhận diện, lập kế hoạch, tính toán, giải thích; lỗi đã mắc; kỹ năng của các bài làm chưa tốt), hãy chỉ ra học sinh yếu ở đâu và đề xuất cách cải thiện. Viết tiếng Việt, ngắn gọn, cụ thể, dùng được ngay. Không bịa số liệu. Bài "bỏ dở" (mở bài nhưng chưa nhắn gì, hoặc làm dở chưa kết thúc) cũng là tín hiệu: nêu rõ thói quen bỏ bài, có thể do bài khó, thiếu động lực hay ngại hỏi, và gợi ý cách khuyến khích. Bài có "bot phải hiện lời giải N bước" nghĩa là học sinh kẹt, không tự làm được các bước đó: coi là điểm yếu thật, dựa vào "kien_thuc_nen_con_thieu" để đề xuất ôn tập. "buoc_yeu" là các bước học sinh hay gặp khó (bấm gợi ý, hỏi, làm sai hoặc bị giải hộ): với MỖI bước (tối đa 6, ưu tiên bước bị giải hộ) viết một mục trong "step_review" gồm step = tên bước ngắn (ví dụ "Bước 4 · Cộng vế") và review = một đến hai câu ôn tập cụ thể: kiến thức hoặc quy tắc cần ôn và cách luyện (ví dụ làm thêm dạng bài nào). Không nêu đáp án của đề. Ít dữ liệu thì nói rõ là nhận định sơ bộ.
Chỉ trả JSON {"weak_areas":[điểm yếu],"suggestions":[việc giáo viên/học sinh nên làm],"practice":[dạng bài nên luyện thêm],"step_review":[{"step":string,"review":string}]}.`;

type Sb = Awaited<ReturnType<typeof supabaseServer>>;
type Cfg = NonNullable<Awaited<ReturnType<typeof llmCfg>>>;

// Nhận xét một phiên. Đọc qua RLS nên chỉ phiên của giáo viên này đọc được. Không gửi tên hay mã học sinh cho AI.
async function analyzeSession(sb: Sb, cfg: Cfg, teacherId: string, id: string) {
  const { data: s } = await sb.from("chat_sessions").select("id,link_id,problem_code,status,problem_snapshot").eq("id", id).maybeSingle();
  if (!s) return bad("Không tìm thấy phiên này.", 404);
  const sess = s as { link_id: string; problem_code: string; status: string; problem_snapshot: { title?: string; statement?: string; solution_steps?: string[] } | null };
  const [{ data: ms }, { data: ev }, { data: ln }] = await Promise.all([
    sb.from("messages").select("role,content").eq("session_id", id).order("id").limit(500),
    sb.from("session_evals").select("identify,plan,calculate,explain,total,final_correct,hint_count,errors,gaps").eq("session_id", id).maybeSingle(),
    sb.from("public_links").select("problems_snapshot").eq("id", sess.link_id).maybeSingle(),
  ]);
  const msgs = (ms ?? []) as { role: "student" | "bot"; content: string }[];
  if (!msgs.some((m) => m.role === "student")) return bad("Phiên này chưa có tin nhắn nào của học sinh để phân tích.");
  const prob = sess.problem_snapshot ?? ((ln as { problems_snapshot: { id: string; title?: string; statement?: string; solution_steps?: string[] }[] } | null)?.problems_snapshot ?? []).find((x) => x.id === sess.problem_code);
  const text = JSON.stringify({
    de: prob ? { tieu_de: prob.title, de_bai: prob.statement, cac_buoc_loi_giai: prob.solution_steps } : { ma_de: sess.problem_code },
    trang_thai: sess.status === "done" ? "đã kết thúc" : "chưa kết thúc",
    diem_tu_cham: ev ?? "chưa chấm",
    hoi_thoai: msgs.map((m) => `${m.role === "student" ? "HS" : "Bot"}: ${m.content}`),
  });
  const content = await askJson(cfg, SESSION_SYSTEM, [{ role: "user", text }], sessionOut, { think: true, use: "analyze_session" });
  const updated_at = new Date().toISOString();
  check(await admin().from("session_analysis").upsert({ session_id: id, content, updated_at } as never));
  await log({ actor: "teacher", action: "session_analysis", teacherId, linkId: sess.link_id, meta: { problem: sess.problem_code } });
  return Response.json({ analysis: { content, updated_at } });
}

export const POST = api(async (req) => {
  const u = await requireUser();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Dữ liệu không hợp lệ.");
  if (p.data.action === "delete") {
    // Xóa mềm: chỉ ẩn khỏi danh sách; phiên, tin nhắn, điểm giữ nguyên.
    const { data } = await admin().from("students").update({ deleted_at: new Date().toISOString() } as never).eq("teacher_id", u.id).eq("code", p.data.code).is("deleted_at", null).select("name");
    if (!(data as unknown[] | null)?.length) return bad("Không tìm thấy học sinh này.", 404);
    await log({ actor: "teacher", action: "student_deleted", teacherId: u.id, meta: { code: p.data.code, name: (data as { name: string | null }[])[0].name } });
    return Response.json({ ok: true });
  }
  if (p.data.action === "share_get" || p.data.action === "share_create" || p.data.action === "share_revoke") {
    // Liên kết công khai cho phụ huynh: mỗi học sinh một liên kết đang dùng, thu hồi bằng revoked_at.
    const code = p.data.code, db = admin();
    const { data: st } = await db.from("students").select("code").eq("teacher_id", u.id).eq("code", code).is("deleted_at", null).maybeSingle();
    if (!st) return bad("Không tìm thấy học sinh này.", 404);
    const live = async () => ((await db.from("student_shares").select("token").eq("teacher_id", u.id).eq("student_code", code).is("revoked_at", null).maybeSingle()).data as { token: string } | null)?.token ?? null;
    if (p.data.action === "share_get") return Response.json({ token: await live() });
    if (p.data.action === "share_revoke") {
      check(await db.from("student_shares").update({ revoked_at: new Date().toISOString() } as never).eq("teacher_id", u.id).eq("student_code", code).is("revoked_at", null));
      await log({ actor: "teacher", action: "student_share_revoked", teacherId: u.id, meta: { code } });
      return Response.json({ token: null });
    }
    const had = await live();
    if (had) return Response.json({ token: had });
    const token = randomBytes(16).toString("base64url");
    const { error } = await db.from("student_shares").insert({ token, teacher_id: u.id, student_code: code } as never);
    if (error) { const again = await live(); if (again) return Response.json({ token: again }); check({ error }); } // hai lần bấm cùng lúc: dùng liên kết vừa tạo
    await log({ actor: "teacher", action: "student_share_created", teacherId: u.id, meta: { code } });
    return Response.json({ token });
  }
  const cfg = await llmCfg(u.id);
  if (!cfg) return bad("Chưa có API key. Vào Cài đặt để nhập.");
  const sb = await supabaseServer();
  if (p.data.action === "analyze_session") return analyzeSession(sb, cfg, u.id, p.data.id);
  const prof = await loadStudent(sb, p.data.code);
  if (!prof) return bad("Không tìm thấy học sinh này.", 404);
  // Phiên chưa chấm: đếm số tin học sinh đã nhắn để AI phân biệt "bỏ dở khi chưa nhắn gì" với "làm dở".
  const open = prof.attempts.filter((a) => !a.ev);
  const { data: msgs } = open.length ? await sb.from("messages").select("session_id").eq("role", "student").in("session_id", open.map((a) => a.id)) : { data: [] };
  const sent = new Map<string, number>();
  ((msgs ?? []) as { session_id: string }[]).forEach((m) => sent.set(m.session_id, (sent.get(m.session_id) ?? 0) + 1));
  const facts = {
    so_phien: prof.attempts.length,
    so_bai_da_cham: prof.evaluated,
    rubric_tb: prof.rubric.map((r) => `${r.name}: ${critTen(r.value).toFixed(1)}/10`),
    loi_da_mac: prof.errors.slice(0, 8),
    ky_nang_bai_lam_chua_tot: prof.weakSkills.slice(0, 8),
    buoc_yeu: prof.weakSteps.slice(0, 8).map((w) => `${w.title}, bước ${w.step}: ${w.label} (gặp khó ${w.struggled}/${w.of} phiên${w.revealed ? `, bị giải hộ ${w.revealed} phiên` : ""})`),
    kien_thuc_nen_con_thieu: prof.gaps.slice(0, 8), // AI ghi khi chấm các phiên có bước được giải hộ
    cac_bai: prof.attempts.filter((a) => a.ev).slice(0, 10).map((a) => `${a.title}: ${toTen(a.ev!.total)}/10, ${a.ev!.final_correct ? "đúng" : "chưa đúng"}, ${a.ev!.hint_count} gợi ý${a.revealed ? `, bot phải hiện lời giải ${a.revealed} bước vì kẹt (không tính là tự làm)` : ""}`),
    // Chưa chấm: 0 tin = vào bài rồi bỏ, không nhắn gì; có tin = làm dở, chưa kết thúc.
    bai_chua_xong: open.slice(0, 10).map((a) => `${a.title}: ${sent.get(a.id) ? `làm dở, mới nhắn ${sent.get(a.id)} tin, chưa kết thúc` : "mở bài rồi bỏ, chưa nhắn gì"}`),
  };
  const content = await askJson(cfg, SYSTEM, [{ role: "user", text: JSON.stringify(facts) }], out, { think: true, use: "advise" });
  check(await admin().from("student_advice").upsert({ teacher_id: u.id, student_code: p.data.code, content, sessions: prof.attempts.length, updated_at: new Date().toISOString() } as never));
  await log({ actor: "teacher", action: "student_advice", teacherId: u.id, meta: { code: p.data.code } });
  return Response.json({ ok: true });
});
