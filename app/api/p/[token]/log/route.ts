import { admin } from "@/lib/supabase/admin";
import { api, bad } from "@/lib/auth";
import { check } from "@/lib/db";
import { mathHtml } from "@/lib/math-html";
import { shareOf } from "@/lib/share";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Hội thoại một phiên cho phụ huynh (công khai, chỉ đọc). Chỉ trả phiên của đúng học sinh trong liên kết; không trả dữ liệu hệ thống (meta, mã phiên, thời điểm AI phân tích).
export const GET = api(async (req) => {
  const token = new URL(req.url).pathname.split("/").at(-2) ?? "";
  const sh = await shareOf(token);
  if (!sh) return bad("Liên kết đã đóng.", 404);
  const id = new URL(req.url).searchParams.get("session") ?? "";
  if (!UUID.test(id)) return bad("session không hợp lệ.");
  const db = admin();
  const ss = await db.from("chat_sessions").select("problem_code,problem_snapshot,public_links!inner(teacher_id,problems_snapshot)").eq("id", id).eq("student_code", sh.code).eq("public_links.teacher_id", sh.teacherId).maybeSingle();
  check(ss);
  type P = { id: string; title?: string; statement?: string };
  const s = ss.data as unknown as { problem_code: string; problem_snapshot: P | null; public_links: { problems_snapshot: P[] } } | null;
  if (!s) return bad("Không tìm thấy bài làm này.", 404);
  const [r, an] = await Promise.all([
    db.from("messages").select("role,content,ts").eq("session_id", id).order("id").limit(500),
    db.from("session_analysis").select("content").eq("session_id", id).maybeSingle(),
  ]);
  check(r);
  const p = s.problem_snapshot ?? s.public_links.problems_snapshot?.find((x) => x.id === s.problem_code);
  const items = ((r.data ?? []) as { role: "student" | "bot"; content: string; ts: string }[]).map((m) => ({
    role: m.role,
    time: new Date(m.ts).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
    html: mathHtml(m.content),
  }));
  return Response.json({ items, problem: p ? { title: p.title ?? "", statement: p.statement ?? "" } : null, analysis: an.error ? null : (an.data as { content: unknown } | null)?.content ?? null });
});
