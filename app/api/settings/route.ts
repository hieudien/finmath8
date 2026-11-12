import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { api, bad, requireUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { checkKey } from "@/lib/llm";
import { PROVIDERS } from "@/lib/models";
import { log } from "@/lib/log";
import { llmCfg } from "@/lib/teacher";

const body = z.object({
  key: z.string().trim().optional(),
});

export const POST = api(async (req) => {
  const u = await requireUser();
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("Dữ liệu không hợp lệ.");
  const { key } = p.data;
  const label = PROVIDERS.gemini.label;

  const { data: before } = await admin().from("teacher_settings").select("gemini_key_enc").eq("teacher_id", u.id).maybeSingle();
  const hasKey = !!(before as { gemini_key_enc: string | null } | null)?.gemini_key_enc;
  if (!key && !hasKey) return bad(`Chưa có API key của ${label}. Dán key vào ô API key.`);

  if (key) {
    try {
      // Key chỉ cần dùng được ít nhất một model trong danh sách (key cũ có thể thiếu model mới nhất; chuỗi fallback sẽ bỏ qua model không có).
      let err: unknown;
      for (const model of PROVIDERS.gemini.models) {
        try { await checkKey("gemini", key, model); err = undefined; break; } catch (e) { err = e; if (String((e as Error).message) !== "model") throw e; }
      }
      if (err) throw err;
    } catch (e) {
      const m = String((e as Error).message);
      return bad(m === "model" ? `${label} không có model nào trong danh sách cho key này. Báo admin.` : m === "key" ? `${label} từ chối key này. Kiểm tra lại key (chép đủ, không thừa khoảng trắng).` : `Không kiểm tra được key với ${label} (${m}). Thử lại sau.`);
    }
  }

  const row: Record<string, unknown> = { teacher_id: u.id, provider: "gemini", updated_at: new Date().toISOString() };
  if (key) row.gemini_key_enc = encrypt(key);
  const { error } = await admin().from("teacher_settings").upsert(row as never);
  if (error) return bad("Không lưu được cài đặt.", 500);
  llmCfg.drop(u.id);
  await log({ actor: "teacher", action: "settings_changed", teacherId: u.id, meta: { key_changed: !!key } });
  return Response.json({ ok: true, last4: key?.slice(-4) });
});
