import { after } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { parseProblems } from "@/lib/schema/problem";
import Chat from "@/components/Chat";
import Brand from "@/components/Brand";
import { GREETING_FALLBACK } from "@/lib/greeting";
import { teacherMode } from "@/lib/teacher";
import { modeFor } from "@/lib/modes";
import { choiceOptions, stepCue, stepsGreeting } from "@/lib/chat/goals";
import { checkpoints } from "@/lib/chat/progress";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await admin().from("public_links").select("label").eq("slug", slug).is("deleted_at", null).maybeSingle();
  const label = (data as { label: string } | null)?.label;
  return { title: label ? `${label} · MathStep AI` : "MathStep AI", robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await admin().from("public_links").select("id,teacher_id,label,active,expires_at,problems_snapshot,max_messages").eq("slug", slug).is("deleted_at", null).maybeSingle();
  const l = data as { id: string; teacher_id: string; label: string; active: boolean; expires_at: string | null; problems_snapshot: unknown; max_messages: number } | null;
  const open = l && l.active && !(l.expires_at && new Date(l.expires_at) < new Date());
  if (!l || !open) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-3 px-4">
        <Brand tagline />
        <h1>Liên kết đã đóng</h1>
        <p className="text-text-muted">Liên kết này không còn dùng được. Hỏi giáo viên để lấy liên kết mới.</p>
      </main>
    );
  }
  const linkId = l.id;
  after(async () => { await admin().rpc("bump_visit", { p_link: linkId } as never); }); // không chặn việc hiển thị trang
  // greeting: lời chào hiện ngay khi bấm chọn bài, khỏi chờ server. Đề không có statement thì để AI mở bài (rỗng).
  // Kiểu "từng bước": lời chào cố định, hiện ngay; total = số bước để hiện "Bước k/n". Đề thiếu lời giải từng bước chạy chat (modeFor).
  const tm = await teacherMode(l.teacher_id);
  const problems = parseProblems(l.problems_snapshot).ok.map((p) => {
    const mode = modeFor(tm, p);
    return { id: p.id, title: p.title, statement: p.statement ?? "", mode, total: checkpoints(p).length, goal: mode !== "chat" ? stepCue(p, 0) : "", options: mode === "quiz" ? choiceOptions(p, 0, p.id) : undefined, greeting: mode !== "chat" ? stepsGreeting(p, mode === "quiz") : p.statement ? p.greeting || GREETING_FALLBACK : "" };
  });
  return <Chat slug={slug} label={l.label} problems={problems} />;
}
