import { admin } from "@/lib/supabase/admin";

export type Who = "teacher" | "student";
export type Ctx = { teacherId?: string | null; linkId?: string | null; anonId?: string | null; actor?: Who | "system"; kind?: string; meta?: Record<string, unknown> };
// Dấu vết của một request: handler gán action, teacherId, linkId khi biết; đồng hồ canh và nhánh lỗi đọc lại để ghi nhật ký.
export type Trace = Ctx & { action?: string };

// Nhóm lỗi dùng chung cho câu thân thiện và cột error_logs.kind. Nhãn hiển thị ở lib/log-labels.ts (ERR_KIND).
const RE = {
  db: /Lỗi cơ sở dữ liệu/,
  quota: /PerDay|RESOURCE_EXHAUSTED|\b429\b|quota/i,
  timeout: /AI_TIMEOUT/,
  key: /API key not valid|API_KEY_INVALID|\b401\b|\b403\b|PERMISSION_DENIED|UNAUTHENTICATED/i,
  model: /model.*(not found|does not exist|no longer available)|\b404\b.*model|NOT_FOUND/i,
  overload: /\b50\d\b|UNAVAILABLE|overload|high demand|fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND|timeout|network|AI_SLOW/i,
  format: /sai định dạng/i,
};
export function kindOf(e: unknown) {
  const s = String((e as Error)?.message ?? e);
  return (Object.keys(RE) as (keyof typeof RE)[]).find((k) => RE[k].test(s)) ?? "other";
}

export const contact = () => {
  const c = process.env.NEXT_PUBLIC_ADMIN_CONTACT;
  return c ? `Hãy liên hệ quản trị viên: ${c}.` : "Hãy liên hệ quản trị viên.";
};

type Friendly = { message: string; status: number; known: boolean };

// Đổi lỗi kỹ thuật thành câu dễ hiểu. known=false là lỗi chưa gặp: sẽ kèm mã lỗi và cách liên hệ admin.
export function friendly(e: unknown, who: Who = "teacher"): Friendly {
  const s = String((e as Error)?.message ?? e);
  const t = who === "teacher";
  if (RE.quota.test(s))
    return { known: true, status: 503, message: t ? "AI chạm giới hạn: nhà cung cấp báo hết hạn mức của API key. Kiểm tra gói hoặc thanh toán của key, hoặc chờ sang ngày mới rồi thử lại." : "AI đã chạm giới hạn lượt dùng nên chưa trả lời được. Bạn chờ một lúc rồi thử lại, hoặc báo giáo viên giúp nhé." };
  if (RE.timeout.test(s))
    return { known: true, status: 503, message: t ? "AI phản hồi quá chậm (có thể đang quá tải). Thử lại sau ít phút." : "AI đang quá tải hoặc phản hồi chậm. Bạn chờ khoảng 1 phút rồi bấm Gửi lại nhé, tin của bạn vẫn còn trong ô nhập." };
  if (RE.key.test(s))
    return { known: true, status: 503, message: t ? "API key không hợp lệ hoặc đã bị thu hồi. Vào Cài đặt và nhập key mới." : "Chatbot chưa dùng được vì cài đặt AI của giáo viên có vấn đề. Em báo giáo viên giúp nhé." };
  if (RE.model.test(s))
    return { known: true, status: 503, message: t ? "Model AI đã chọn không còn dùng được. Vào Cài đặt và chọn model khác." : "Chatbot đang được giáo viên cập nhật. Em thử lại sau nhé." };
  if (RE.overload.test(s))
    return { known: true, status: 503, message: t ? "Dịch vụ AI đang quá tải hoặc mất kết nối. Chờ vài phút rồi thử lại." : "AI đang quá tải (nhiều bạn dùng cùng lúc). Bạn chờ khoảng 1 phút rồi bấm Gửi lại nhé, tin của bạn vẫn còn trong ô nhập." };
  if (RE.format.test(s))
    return { known: true, status: 502, message: "AI trả lời chưa đúng định dạng. Bấm thử lại. Nếu vẫn lỗi, đổi sang model khác ở Cài đặt." };
  return { known: false, status: 500, message: t ? "Có lỗi xảy ra ngoài dự kiến." : "Chatbot gặp lỗi ngoài dự kiến." };
}

// Ghi lỗi vào bảng error_logs (giáo viên thấy ở Cài đặt, mục Nhật ký lỗi) và trả mã lỗi ngắn để người dùng gửi cho admin.
export async function reportError(e: unknown, where: string, ctx: Ctx = {}) {
  const ref = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(3)), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  console.error(`[${ref}] ${where}`, e);
  const message = String((e as Error)?.message ?? e).slice(0, 1000);
  try {
    const { error } = await admin().from("error_logs").insert({
      ref, kind: ctx.kind ?? kindOf(e), where_: where.slice(0, 200), message, stack: (e as Error)?.stack?.slice(0, 2000) ?? null,
      actor: ctx.actor ?? "system", teacher_id: ctx.teacherId ?? null, link_id: ctx.linkId ?? null, anon_id: ctx.anonId ?? null, meta: ctx.meta ?? {},
    } as never);
    if (error) console.error(`[${ref}] LOGFAIL ${where}: ${message}`, error.message); // ghi DB hỏng: dòng này còn lại trong log của hosting để tra theo mã
  } catch (x) {
    console.error(`[${ref}] LOGFAIL ${where}: ${message}`, (x as Error)?.message); // ghi log hỏng cũng không được làm hỏng phản hồi
  }
  return ref;
}

// Dùng thay cho .catch(() => null): kết quả vẫn là null (luồng chạy như cũ) nhưng lỗi được ghi, meta.swallowed = true.
// Không chờ ghi DB (request thường đã sát hạn 60s). Tối đa 30 dòng mỗi phút mỗi tiến trình: hết quota AI khi chạy hàng loạt không làm phình bảng.
let swallowed = 0, swallowedAt = 0;
export function swallow(where: string, ctx: Ctx = {}) {
  return async (e: unknown): Promise<null> => {
    if (Date.now() - swallowedAt > 60_000) { swallowedAt = Date.now(); swallowed = 0; }
    if (swallowed++ < 30) void reportError(e, where, { actor: "system", ...ctx, meta: { ...ctx.meta, swallowed: true } });
    else console.error(`[SWALLOW-CAP] ${where}`, (e as Error)?.message ?? e);
    return null;
  };
}

// Đồng hồ canh: request chạy quá ms mà chưa xong (sắp bị hosting cắt, khi đó không còn chỗ nào để ghi) thì ghi ngay một dòng.
// ctx là đối tượng sửa được (Trace): nơi gọi bổ sung teacherId/linkId khi biết, đồng hồ đọc giá trị lúc nổ.
export function watchdog(where: string, ctx: Trace = {}, opts: { ms?: number } = {}) {
  const ms = opts.ms ?? 55_000;
  const t0 = Date.now();
  const timer = setTimeout(async () => {
    await reportError(new Error(`Yêu cầu chưa xong sau ${Math.round((Date.now() - t0) / 1000)}s, có thể sắp bị cắt`), where, { ...ctx, kind: "watchdog", meta: { ...ctx.meta, action: ctx.action, ms: Date.now() - t0 } });
  }, ms);
  timer.unref?.();
  return () => clearTimeout(timer);
}

// Tạo Response lỗi thân thiện. Lỗi lạ thì kèm mã lỗi + cách liên hệ admin.
export async function failResponse(e: unknown, who: Who, where: string, ctx: Ctx = {}) {
  const f = friendly(e, who);
  const ref = await reportError(e, where, { actor: who, ...ctx });
  const message = f.known ? f.message : who === "student" ? `${f.message} Em báo giáo viên và đọc mã lỗi: ${ref}.` : `${f.message} Mã lỗi: ${ref}. ${contact()} Gửi kèm mã lỗi này.`;
  return Response.json({ error: message, ref }, { status: f.status });
}
