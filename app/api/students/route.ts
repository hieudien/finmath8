import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { api, bad, requireUser } from "@/lib/auth";
import { askJson } from "@/lib/llm";
import { llmCfg } from "@/lib/teacher";
import { loadStudent } from "@/lib/students";
import { check } from "@/lib/db";
import { log } from "@/lib/log";

const body = z.object({ action: z.literal("advise"), code: z.string().regex(/^[A-Z0-9._-]{1,20}$/) });
const out = z.object({ weak_areas: z.array(z.string()).max(6), suggestions: z.array(z.string()).max(6), practice: z.array(z.string()).max(5) });

const SYSTEM = `Bạn là trợ lý cho giáo viên Toán. Dựa trên số liệu một học sinh làm bài với chatbot gợi mở (rubric 0–3: nhận diện, lập kế hoạch, tính toán, giải thích; lỗi đã mắc; kỹ năng của các bài làm chưa tốt), hãy chỉ ra học sinh yếu ở đâu và đề xuất cách cải thiện. Viết tiếng Việt, ngắn gọn, cụ thể, dùng được ngay. Không bịa số liệu. Bài "bỏ dở" (mở bài nhưng chưa nhắn gì, hoặc làm dở chưa kết thúc) cũng là tín hiệu: nêu rõ thói quen bỏ bài, có thể do bài khó, thiếu động lực hay ngại hỏi, và gợi ý cách khuyến khích. Bài có "bot phải hiện lời giải N bước" nghĩa là học sinh kẹt, không tự làm được các bước đó: coi là điểm yếu thật, dựa vào "kien_thuc_nen_con_thieu" để đề xuất ôn tập. Ít dữ liệu thì nói rõ là nhận định sơ bộ.
Chỉ trả JSON {"weak_areas":[điểm yếu],"suggestions":[việc giáo viên/học sinh nên làm],"practice":[dạng bài nên luyện thêm]}.`;

export const POST = api(async (req) => {
  const u = await requireUser();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Dữ liệu không hợp lệ.");
  const cfg = await llmCfg(u.id);
  if (!cfg) return bad("Chưa có API key. Vào Cài đặt để nhập.");
  const sb = await supabaseServer();
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
    rubric_tb: prof.rubric.map((r) => `${r.name}: ${r.value.toFixed(1)}/3`),
    loi_da_mac: prof.errors.slice(0, 8),
    ky_nang_bai_lam_chua_tot: prof.weakSkills.slice(0, 8),
    kien_thuc_nen_con_thieu: prof.gaps.slice(0, 8), // AI ghi khi chấm các phiên có bước được giải hộ
    cac_bai: prof.attempts.filter((a) => a.ev).slice(0, 10).map((a) => `${a.title}: ${a.ev!.total}/12, ${a.ev!.final_correct ? "đúng" : "chưa đúng"}, ${a.ev!.hint_count} gợi ý${a.revealed ? `, bot phải hiện lời giải ${a.revealed} bước vì kẹt (không tính là tự làm)` : ""}`),
    // Chưa chấm: 0 tin = vào bài rồi bỏ, không nhắn gì; có tin = làm dở, chưa kết thúc.
    bai_chua_xong: open.slice(0, 10).map((a) => `${a.title}: ${sent.get(a.id) ? `làm dở, mới nhắn ${sent.get(a.id)} tin, chưa kết thúc` : "mở bài rồi bỏ, chưa nhắn gì"}`),
  };
  const content = await askJson(cfg, SYSTEM, [{ role: "user", text: JSON.stringify(facts) }], out, { think: true });
  check(await admin().from("student_advice").upsert({ teacher_id: u.id, student_code: p.data.code, content, sessions: prof.attempts.length, updated_at: new Date().toISOString() } as never));
  await log({ actor: "teacher", action: "student_advice", teacherId: u.id, meta: { code: p.data.code } });
  return Response.json({ ok: true });
});
