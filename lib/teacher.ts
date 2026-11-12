import { admin } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import type { LlmCfg } from "@/lib/llm";
import { log } from "@/lib/log";
import { kindOf, reportError } from "@/lib/errors";
import { PROVIDERS, TEMPERATURE, type Provider } from "@/lib/models";
import { ttl } from "@/lib/ttl";

type Row = { gemini_key_enc: string | null };

async function load(teacherId: string): Promise<LlmCfg | null> {
  const { data, error } = await admin().from("teacher_settings").select("gemini_key_enc").eq("teacher_id", teacherId).maybeSingle();
  // Lỗi đọc DB (vd lệch schema) không được coi là "chưa có key": báo lỗi thật để không đánh lừa giáo viên.
  if (error) throw new Error(`Không đọc được cài đặt AI: ${error.message}`);
  const enc = (data as Row | null)?.gemini_key_enc;
  if (!enc) return null;
  const provider: Provider = "gemini";
  return {
    provider,
    teacherId,
    key: decrypt(enc),
    model: PROVIDERS[provider].models[0], // model cố định trong code, cột model trong DB không còn dùng
    temperature: TEMPERATURE,
    // Đổi model vì lỗi: ghi cả vào nhật ký lỗi (kèm loại lỗi) để thống kê quota, quá tải, model hỏng. Lỗi cuối cùng không cứu được do nơi gọi ghi.
    onFallback: (from, to, reason) => {
      void log({ actor: "system", action: "model_fallback", teacherId, meta: { from, to, reason } });
      void reportError(new Error(reason), `AI đổi model ${from} sang ${to}`, { teacherId, kind: kindOf(reason), meta: { from, to } });
    },
    onUsage: (u) => void log({ actor: "system", action: "ai_usage", teacherId, meta: u }),
  };
}

// Cache 30 giây: mỗi tin nhắn chat không phải đọc DB và giải mã key lại. Lưu cài đặt thì gọi llmCfg.drop(id).
export const llmCfg = ttl(30_000, load);
