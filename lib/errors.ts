import { randomBytes } from "node:crypto";
import { log } from "@/lib/log";

export type Who = "teacher" | "student";
type Ctx = { teacherId?: string | null; linkId?: string | null; anonId?: string | null };

export const contact = () => {
  const c = process.env.NEXT_PUBLIC_ADMIN_CONTACT;
  return c ? `Hãy liên hệ quản trị viên: ${c}.` : "Hãy liên hệ quản trị viên.";
};

type Friendly = { message: string; status: number; known: boolean };

// Đổi lỗi kỹ thuật thành câu dễ hiểu. known=false là lỗi chưa gặp: sẽ kèm mã lỗi và cách liên hệ admin.
export function friendly(e: unknown, who: Who = "teacher"): Friendly {
  const s = String((e as Error)?.message ?? e);
  const t = who === "teacher";
  if (/PerDay|insufficient_quota|RESOURCE_EXHAUSTED|\b429\b|quota/i.test(s))
    return { known: true, status: 503, message: t ? "Nhà cung cấp AI báo hết hạn mức hoặc hết số dư của API key. Kiểm tra gói hoặc thanh toán của key, hoặc chờ sang ngày mới rồi thử lại." : "Chatbot tạm nghỉ vì hết lượt dùng AI. Em báo giáo viên giúp nhé." };
  if (/API key not valid|API_KEY_INVALID|invalid_api_key|Incorrect API key|\b401\b|\b403\b|PERMISSION_DENIED|UNAUTHENTICATED/i.test(s))
    return { known: true, status: 503, message: t ? "API key không hợp lệ hoặc đã bị thu hồi. Vào Cài đặt và nhập key mới." : "Chatbot chưa dùng được vì cài đặt AI của giáo viên có vấn đề. Em báo giáo viên giúp nhé." };
  if (/model.*(not found|does not exist|no longer available)|\b404\b.*model|NOT_FOUND/i.test(s))
    return { known: true, status: 503, message: t ? "Model AI đã chọn không còn dùng được. Vào Cài đặt và chọn model khác." : "Chatbot đang được giáo viên cập nhật. Em thử lại sau nhé." };
  if (/\b50\d\b|UNAVAILABLE|overload|high demand|fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND|timeout|network/i.test(s))
    return { known: true, status: 503, message: "Dịch vụ AI đang quá tải hoặc mất kết nối. Chờ vài phút rồi thử lại." };
  if (/sai định dạng/i.test(s))
    return { known: true, status: 502, message: "AI trả lời chưa đúng định dạng. Bấm thử lại. Nếu vẫn lỗi, đổi sang model khác ở Cài đặt." };
  return { known: false, status: 500, message: t ? "Có lỗi xảy ra ngoài dự kiến." : "Chatbot gặp lỗi ngoài dự kiến." };
}

// Ghi lỗi vào nhật ký (giáo viên thấy ở trang Nhật ký) và trả mã lỗi ngắn để người dùng gửi cho admin.
export async function reportError(e: unknown, where: string, ctx: Ctx = {}) {
  const ref = randomBytes(3).toString("hex").toUpperCase();
  console.error(`[${ref}] ${where}`, e);
  try {
    await log({ actor: "system", action: "error", teacherId: ctx.teacherId, linkId: ctx.linkId, anonId: ctx.anonId, meta: { ref, where, message: String((e as Error)?.message ?? e).slice(0, 300) } });
  } catch {
    /* ghi log hỏng cũng không được làm hỏng phản hồi */
  }
  return ref;
}

// Tạo Response lỗi thân thiện. Lỗi lạ thì kèm mã lỗi + cách liên hệ admin.
export async function failResponse(e: unknown, who: Who, where: string, ctx: Ctx = {}) {
  const f = friendly(e, who);
  const ref = await reportError(e, where, ctx);
  const message = f.known ? f.message : who === "student" ? `${f.message} Em báo giáo viên và đọc mã lỗi: ${ref}.` : `${f.message} Mã lỗi: ${ref}. ${contact()} Gửi kèm mã lỗi này.`;
  return Response.json({ error: message, ref }, { status: f.status });
}
