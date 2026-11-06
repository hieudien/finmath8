import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { api, bad, requireUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { checkKey } from "@/lib/llm";
import { modelOk, PROVIDERS } from "@/lib/models";
import { log } from "@/lib/log";

const body = z.object({
  provider: z.enum(["gemini", "openai"]),
  key: z.string().trim().optional(),
  model: z.string().trim(),
  temperature: z.number().min(0).max(1).default(0.3),
});

export const POST = api(async (req) => {
  const u = await requireUser();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Dữ liệu không hợp lệ.");
  const { provider, key, model, temperature } = p.data;
  if (!modelOk(provider, model)) return bad("Tên model không hợp lệ.");
  const label = PROVIDERS[provider].label;

  const col = provider === "openai" ? "openai_key_enc" : "gemini_key_enc";
  const { data: ex } = await admin().from("teacher_settings").select("gemini_key_enc,openai_key_enc").eq("teacher_id", u.id).maybeSingle();
  const hasKey = !!(ex as Record<string, string | null> | null)?.[col];
  if (!key && !hasKey) return bad(`Chưa có API key của ${label}. Dán key vào ô API key.`);

  if (key) {
    try {
      await checkKey(provider, key, model);
    } catch (e) {
      const m = String((e as Error).message);
      return bad(m === "model" ? `${label} không có model "${model}" cho key này. Chọn model khác.` : m === "key" ? `${label} từ chối key này. Kiểm tra lại key (chép đủ, không thừa khoảng trắng).` : `Không kiểm tra được key với ${label} (${m}). Thử lại sau.`);
    }
  }

  const row: Record<string, unknown> = { teacher_id: u.id, provider, model, temperature, updated_at: new Date().toISOString() };
  if (key) row[col] = encrypt(key);
  const { error } = await admin().from("teacher_settings").upsert(row as never);
  if (error) return bad("Không lưu được cài đặt.", 500);
  await log({ actor: "teacher", action: "settings_changed", teacherId: u.id, meta: { provider, model, temperature, key_changed: !!key } });
  return Response.json({ ok: true, last4: key?.slice(-4) });
});
