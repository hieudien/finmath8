import { supabaseServer } from "@/lib/supabase/server";
import { api, bad, requireUser } from "@/lib/auth";
import { check } from "@/lib/db";
import { mathHtml } from "@/lib/math-html";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Hội thoại của 1 phiên, đã dựng sẵn công thức (RLS giới hạn: giáo viên chỉ đọc được phiên của mình).
export const GET = api(async (req) => {
  await requireUser();
  const id = new URL(req.url).searchParams.get("session") ?? "";
  if (!UUID.test(id)) return bad("session không hợp lệ.");
  const sb = await supabaseServer();
  const [r, an, ss] = await Promise.all([
    sb.from("messages").select("role,content,ts").eq("session_id", id).order("id").limit(500),
    sb.from("session_analysis").select("content,updated_at").eq("session_id", id).maybeSingle(),
    sb.from("chat_sessions").select("problem_code,public_links(problems_snapshot)").eq("id", id).maybeSingle(),
  ]);
  check(r);
  // Đề lấy từ bản chụp trong liên kết: đúng nội dung học sinh đã làm, kể cả khi đề gốc đã sửa hoặc xóa.
  const s = (ss.error ? null : ss.data) as { problem_code: string; public_links: { problems_snapshot: { id: string; title?: string; statement?: string }[] } | null } | null;
  const p = s?.public_links?.problems_snapshot?.find((x) => x.id === s.problem_code);
  const problem = p ? { id: p.id, title: p.title ?? "", statement: p.statement ?? "" } : null;
  const items = ((r.data ?? []) as { role: "student" | "bot"; content: string; ts: string }[]).map((m) => ({
    role: m.role,
    time: new Date(m.ts).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
    html: mathHtml(m.content),
  }));
  return Response.json({ items, problem, analysis: an.error ? null : an.data ?? null });
});
