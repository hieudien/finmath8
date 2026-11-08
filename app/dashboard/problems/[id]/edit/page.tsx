import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { problemSchema } from "@/lib/schema/problem";
import ProblemEditor from "@/components/ProblemEditor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { data } = await (await supabaseServer()).from("problems").select("content").eq("id", id).is("deleted_at", null).maybeSingle();
  const p = problemSchema.safeParse((data as { content: unknown } | null)?.content);
  if (!p.success) notFound();
  return <ProblemEditor initial={p.data} />;
}
