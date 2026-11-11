import { supabaseServer } from "@/lib/supabase/server";
import WordImport, { type DraftBatch } from "@/components/WordImport";
import { BatchHistory, type HistoryRow } from "@/components/BatchHistory";
import { ProblemsTabs } from "@/components/ProblemsTabs";
import { Alert } from "@/components/ui";
import { viewOf, type BatchItem, type Fail } from "@/lib/import-batch";

export default async function Page() {
  const sb = await supabaseServer();
  const [{ data: bd }, { data: hd }] = await Promise.all([
    sb.from("import_batches").select("id,file_name,grade,items,read_errors").eq("status", "draft").order("created_at", { ascending: false }).limit(1),
    sb.from("import_batches").select("id,created_at,confirmed_at,file_name,grade,status,sources,read_errors,items").neq("status", "draft").order("created_at", { ascending: false }).limit(50),
  ]);
  const b = ((bd ?? []) as { id: string; file_name: string; grade: number; items: BatchItem[]; read_errors: Fail[] }[])[0];
  const draft: DraftBatch | null = b ? { id: b.id, file_name: b.file_name, grade: b.grade, read_errors: b.read_errors, items: b.items.map((it) => ({ ...viewOf([it])[0], statement: it.statement, answers: it.answers })) } : null;
  return (
    <div className="flex flex-col gap-6">
      <h1>Đề bài</h1>
      <ProblemsTabs current="bulk" />
      <section aria-labelledby="mk" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 md:p-6">
        <h2 id="mk">Tạo đề hàng loạt từ tệp Word</h2>
        {draft && <Alert tone="warning">Còn một bản nháp chưa xác nhận. Xác nhận hoặc hủy trước khi tạo đợt mới.</Alert>}
        <WordImport draft={draft} />
      </section>
      <section aria-labelledby="hist" className="flex flex-col gap-3">
        <h2 id="hist">Lịch sử các đợt</h2>
        <BatchHistory rows={(hd ?? []) as HistoryRow[]} />
      </section>
    </div>
  );
}
