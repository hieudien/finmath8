import { admin } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import type { LlmCfg } from "@/lib/llm";
import { log } from "@/lib/log";
import { PROVIDERS, TEMPERATURE, type Provider } from "@/lib/models";
import { ttl } from "@/lib/ttl";
import { DEFAULT_MODE, isMode, type Mode } from "@/lib/modes";

type Row = { provider: Provider; gemini_key_enc: string | null; openai_key_enc: string | null };

async function load(teacherId: string): Promise<LlmCfg | null> {
  const { data } = await admin().from("teacher_settings").select("provider,gemini_key_enc,openai_key_enc").eq("teacher_id", teacherId).maybeSingle();
  const s = data as Row | null;
  const enc = s && (s.provider === "openai" ? s.openai_key_enc : s.gemini_key_enc);
  if (!s || !enc) return null;
  return {
    provider: s.provider,
    key: decrypt(enc),
    model: PROVIDERS[s.provider].models[0], // model cố định trong code, cột model trong DB không còn dùng
    temperature: TEMPERATURE,
    onFallback: (from, to, reason) => void log({ actor: "system", action: "model_fallback", teacherId, meta: { from, to, reason } }),
    onUsage: (u) => void log({ actor: "system", action: "ai_usage", teacherId, meta: u }),
  };
}

// Cache 30 giây: mỗi tin nhắn chat không phải đọc DB và giải mã key lại. Lưu cài đặt thì gọi llmCfg.drop(id).
export const llmCfg = ttl(30_000, load);

// Kiểu tương tác học sinh của giáo viên (chat / từng bước). Cache 30 giây như llmCfg; lưu cài đặt thì gọi teacherMode.drop(id).
export const teacherMode = ttl(30_000, async (teacherId: string): Promise<Mode> => {
  const { data } = await admin().from("teacher_settings").select("interaction_mode").eq("teacher_id", teacherId).maybeSingle();
  const m = (data as { interaction_mode?: string } | null)?.interaction_mode;
  return isMode(m) ? m : DEFAULT_MODE;
});
