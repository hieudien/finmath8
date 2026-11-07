import { admin } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import type { LlmCfg } from "@/lib/llm";
import { log } from "@/lib/log";
import type { Provider } from "@/lib/models";

type Row = { provider: Provider; gemini_key_enc: string | null; openai_key_enc: string | null; model: string; temperature: number };

export async function llmCfg(teacherId: string): Promise<LlmCfg | null> {
  const { data } = await admin().from("teacher_settings").select("*").eq("teacher_id", teacherId).maybeSingle();
  const s = data as Row | null;
  const enc = s && (s.provider === "openai" ? s.openai_key_enc : s.gemini_key_enc);
  if (!s || !enc) return null;
  return {
    provider: s.provider,
    key: decrypt(enc),
    model: s.model,
    temperature: s.temperature,
    onUsage: (model, inTok, outTok) => void log({ actor: "system", action: "ai_call", teacherId, meta: { model, in: inTok, out: outTok } }),
    onQuota: (model, q) => void log({ actor: "system", action: "quota_hit", teacherId, meta: { model, kind: q.kind, limit: q.limit } }),
    onFallback: (from, to, reason) => void log({ actor: "system", action: "model_fallback", teacherId, meta: { from, to, reason } }),
  };
}
