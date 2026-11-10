import { admin } from "@/lib/supabase/admin";

export type Who = "teacher" | "student";
type Ctx = { teacherId?: string | null; linkId?: string | null; anonId?: string | null; actor?: Who | "system"; kind?: string; meta?: Record<string, unknown> };

// Nhóm lỗi dùng chung cho câu thân thiện và cột error_logs.kind. Nhãn hiển thị ở lib/log-labels.ts (ERR_KIND).
const RE = {
  db: /Lỗi cơ sở dữ liệu/,
  quota: /PerDay|insufficient_quota|RESOURCE_EXHAUSTED|\b429\b|quota/i,
  timeout: /AI_TIMEOUT/,
  key: /API key not valid|API_KEY_INVALID|invalid_api_key|Incorrect API key|\b401\b|\b403\b|PERMISSION_DENIED|UNAUTHENTICATED/i,
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
    return { known: true, status: 503, message: t ? "AI chạm giới hạn: nhà cung cấp báo hết hạn mức hoặc hết số dư của API key. Kiểm tra gói hoặc thanh toán của key, hoặc chờ sang ngày mới rồi thử lại." : "AI đã chạm giới hạn lượt dùng nên chưa trả lời được. Bạn chờ một lúc rồi thử lại, hoặc báo giáo viên giúp nhé." };
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
  try {
    const { error } = await admin().from("error_logs").insert({
      ref, kind: ctx.kind ?? kindOf(e), where_: where.slice(0, 200), message: String((e as Error)?.message ?? e).slice(0, 500), stack: (e as Error)?.stack?.slice(0, 2000) ?? null,
      actor: ctx.actor ?? "system", teacher_id: ctx.teacherId ?? null, link_id: ctx.linkId ?? null, anon_id: ctx.anonId ?? null, meta: ctx.meta ?? {},
    } as never);
    if (error) console.error("error_logs insert failed", error.message);
  } catch {
    /* ghi log hỏng cũng không được làm hỏng phản hồi */
  }
  return ref;
}

// Tạo Response lỗi thân thiện. Lỗi lạ thì kèm mã lỗi + cách liên hệ admin.
export async function failResponse(e: unknown, who: Who, where: string, ctx: Ctx = {}) {
  const f = friendly(e, who);
  const ref = await reportError(e, where, { actor: who, ...ctx });
  const message = f.known ? f.message : who === "student" ? `${f.message} Em báo giáo viên và đọc mã lỗi: ${ref}.` : `${f.message} Mã lỗi: ${ref}. ${contact()} Gửi kèm mã lỗi này.`;
  return Response.json({ error: message, ref }, { status: f.status });
}
