import { supabaseServer, currentUser } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import SettingsForm from "@/components/SettingsForm";
import ActivityLog from "@/components/ActivityLog";
import ErrorLog from "@/components/ErrorLog";
import AuditAll from "@/components/AuditAll";
import NormalizeAll from "@/components/NormalizeAll";
import ConfirmAnswers, { type AnswerRow } from "@/components/ConfirmAnswers";
import { problemSchema } from "@/lib/schema/problem";
import { substituteState } from "@/lib/verify-solution";
import { cannotLock } from "@/lib/ready";
import { answersInline } from "@/lib/answers";

type Row = { gemini_key_enc: string | null };

const tail = (enc: string | null | undefined) => {
  try { return enc ? decrypt(enc).slice(-4) : null; } catch { return null; }
};

export default async function Page() {
  const u = (await currentUser())!;
  const { data } = await (await supabaseServer()).from("teacher_settings").select("*").eq("teacher_id", u.id).maybeSingle();
  const s = data as Row | null;
  const { data: pr } = await supabaseServer().then((sb) => sb.from("problems").select("id,code,content").is("deleted_at", null).order("code"));
  const answers: AnswerRow[] = ((pr ?? []) as { id: string; code: string; content: unknown }[]).map((r) => {
    const parsed = problemSchema.safeParse(r.content);
    const p = parsed.success ? parsed.data : null;
    return { id: r.id, code: r.code, title: p?.title ?? "(đề sai định dạng)", answer: p && Object.keys(p.solution).length ? answersInline(p.solution) : "", locked: !!p?.answer_locked, check: p ? substituteState(p).state : "skip", blocked: cannotLock(r.content) === "Đã khóa." ? "" : cannotLock(r.content) };
  });
  return (
    <div className="flex flex-col gap-6">
      <h1>Cài đặt</h1>
      <SettingsForm last4={tail(s?.gemini_key_enc)} />
      <ConfirmAnswers rows={answers} />
      <AuditAll />
      <NormalizeAll />
      <ActivityLog />
      <ErrorLog />
    </div>
  );
}
