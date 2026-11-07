import { after } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { parseProblems } from "@/lib/schema/problem";
import Chat from "@/components/Chat";
import Brand from "@/components/Brand";
import { GREETING_FALLBACK } from "@/lib/greeting";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await admin().from("public_links").select("label").eq("slug", slug).maybeSingle();
  const label = (data as { label: string } | null)?.label;
  return { title: label ? `${label} · FinMath 8` : "FinMath 8", robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await admin().from("public_links").select("id,label,active,expires_at,problems_snapshot,max_messages").eq("slug", slug).maybeSingle();
  const l = data as { id: string; label: string; active: boolean; expires_at: string | null; problems_snapshot: unknown; max_messages: number } | null;
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
  const problems = parseProblems(l.problems_snapshot).ok.map((p) => ({ id: p.id, title: p.title, statement: p.statement ?? "", greeting: p.statement ? p.greeting || GREETING_FALLBACK : "" }));
  return <Chat slug={slug} label={l.label} problems={problems} />;
}
