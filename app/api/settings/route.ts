import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { api, bad, requireUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { checkKey } from "@/lib/llm";
import { PROVIDERS } from "@/lib/models";
import { MODE_IDS } from "@/lib/modes";
import { log } from "@/lib/log";
import { llmCfg, teacherMode } from "@/lib/teacher";

// Hai phần độc lập: nhà cung cấp + key (provider, key) và kiểu tương tác (mode). Gửi phần nào lưu phần đó.
const body = z.object({
  provider: z.enum(["gemini", "openai"]).optional(),
  key: z.string().trim().optional(),
  mode: z.enum(MODE_IDS).optional(),
});

export const POST = api(async (req) => {
  const u = await requireUser();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Dữ liệu không hợp lệ.");
  const { provider, key, mode } = p.data;
  if (!provider && !mode) return bad("Dữ liệu không hợp lệ.");
  if (key && !provider) return bad("Dữ liệu không hợp lệ.");

  const row: Record<string, unknown> = { teacher_id: u.id, updated_at: new Date().toISOString() };
  if (mode) row.interaction_mode = mode;

  if (provider) {
    const label = PROVIDERS[provider].label;
    const col = provider === "openai" ? "openai_key_enc" : "gemini_key_enc";
    const { data: ex } = await admin().from("teacher_settings").select("gemini_key_enc,openai_key_enc").eq("teacher_id", u.id).maybeSingle();
    const hasKey = !!(ex as Record<string, string | null> | null)?.[col];
    if (!key && !hasKey) return bad(`Chưa có API key của ${label}. Dán key vào ô API key.`);

    if (key) {
      try {
        // Key chỉ cần dùng được ít nhất một model trong danh sách (key cũ có thể thiếu model mới nhất; chuỗi fallback sẽ bỏ qua model không có).
        let err: unknown;
        for (const model of PROVIDERS[provider].models) {
          try { await checkKey(provider, key, model); err = undefined; break; } catch (e) { err = e; if (String((e as Error).message) !== "model") throw e; }
        }
        if (err) throw err;
      } catch (e) {
        const m = String((e as Error).message);
        return bad(m === "model" ? `${label} không có model nào trong danh sách cho key này. Báo admin.` : m === "key" ? `${label} từ chối key này. Kiểm tra lại key (chép đủ, không thừa khoảng trắng).` : `Không kiểm tra được key với ${label} (${m}). Thử lại sau.`);
      }
    }
    row.provider = provider;
    if (key) row[col] = encrypt(key);
  }

  const { error } = await admin().from("teacher_settings").upsert(row as never);
  if (error) return bad("Không lưu được cài đặt.", 500);
  llmCfg.drop(u.id);
  teacherMode.drop(u.id);
  await log({ actor: "teacher", action: "settings_changed", teacherId: u.id, meta: { provider, key_changed: !!key, mode } });
  return Response.json({ ok: true, last4: key?.slice(-4) });
});
