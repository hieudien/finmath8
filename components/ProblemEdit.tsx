import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { problemSchema } from "@/lib/schema/problem";
import ProblemEditor from "@/components/ProblemEditor";
import { UUID } from "@/components/ProblemView";

// Nội dung trang sửa đề; dùng chung cho trang đầy đủ và flyout (inPanel).
export async function ProblemEdit({ id, inPanel = false }: { id: string; inPanel?: boolean }) {
  if (!UUID.test(id)) notFound();
  const { data } = await (await supabaseServer()).from("problems").select("content").eq("id", id).is("deleted_at", null).maybeSingle();
  const p = problemSchema.safeParse((data as { content: unknown } | null)?.content);
  if (!p.success) notFound();
  return <ProblemEditor initial={p.data} rowId={id} inPanel={inPanel} />;
}
