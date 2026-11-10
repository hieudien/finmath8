import { supabaseServer, currentUser } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { type Provider } from "@/lib/models";
import SettingsForm from "@/components/SettingsForm";
import ActivityLog from "@/components/ActivityLog";
import ErrorLog from "@/components/ErrorLog";
import AiCost from "@/components/AiCost";
import { RANGES, toRange, type UsageRow } from "@/lib/pricing";

type Row = { provider: Provider; gemini_key_enc: string | null; openai_key_enc: string | null };

const tail = (enc: string | null | undefined) => {
  try { return enc ? decrypt(enc).slice(-4) : null; } catch { return null; }
};

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const range = toRange((await searchParams).range);
  const u = (await currentUser())!;
  const { data } = await (await supabaseServer()).from("teacher_settings").select("*").eq("teacher_id", u.id).maybeSingle();
  const s = data as Row | null;
  const { data: usage } = await (await supabaseServer()).rpc("ai_usage_summary" as never, { days: RANGES[range][0] } as never);
  const rows = ((usage ?? []) as UsageRow[]).filter((r) => r.model);
  return (
    <div className="flex flex-col gap-6">
      <h1>Cài đặt</h1>
      <SettingsForm
        provider={s?.provider ?? "gemini"}
        last4={{ gemini: tail(s?.gemini_key_enc), openai: tail(s?.openai_key_enc) }}
      />
      <AiCost rows={rows} range={range} />
      <ActivityLog />
      <ErrorLog />
    </div>
  );
}
