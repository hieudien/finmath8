import { z } from "zod";
import { CHUNK } from "@/lib/batch";

export const classifySchema = z.object({ branch: z.enum(["algebra", "geometry", "other"]), topic: z.string().default("") });
export const grade = z.number({ error: "Chọn lớp cho đề." }).int().min(1, "Chọn lớp cho đề.").max(12, "Chọn lớp cho đề.");
export const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("normalize"), text: z.string().min(20, "Văn bản quá ngắn."), grade, reference: z.array(z.string().transform((s) => s.slice(0, 2000))).max(60).optional(), figure: z.object({ path: z.string().min(1).max(200), desc: z.string().max(2000) }).optional() }),
  z.object({ action: z.literal("read_image"), image: z.string().max(6_000_000, "Ảnh quá lớn.").regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Chỉ nhận ảnh png, jpeg, webp.") }),
  z.object({ action: z.literal("upload_figure"), image: z.string().max(1_500_000, "Ảnh hình quá lớn.").regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Chỉ nhận ảnh png, jpeg, webp.") }),
  z.object({ action: z.literal("describe_figure"), image: z.string().max(1_500_000, "Ảnh hình quá lớn.").regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Chỉ nhận ảnh png, jpeg, webp.") }),
  z.object({ action: z.literal("save"), problems: z.array(z.unknown()).min(1) }),
  z.object({ action: z.literal("seed") }),
  z.object({ action: z.literal("verify"), id: z.string().uuid() }),
  z.object({ action: z.literal("set_answer"), id: z.string().uuid(), solution: z.record(z.string(), z.unknown()).refine((s) => Object.keys(s).length > 0, "Đáp án đang trống.") }),
  z.object({ action: z.literal("lock_answer"), id: z.string().uuid() }),
  z.object({ action: z.literal("lock_answers"), ids: z.array(z.string().uuid()).min(1).max(50) }),
  z.object({ action: z.literal("unlock_answer"), id: z.string().uuid() }),
  z.object({ action: z.literal("todo") }),
  z.object({ action: z.literal("todo_all") }),
  z.object({ action: z.literal("state"), id: z.string().uuid() }),
  z.object({ action: z.literal("finish"), ids: z.array(z.string().uuid()).min(1).max(CHUNK) }),
  z.object({ action: z.literal("audit"), ids: z.array(z.string().uuid()).min(1).max(CHUNK) }),
  z.object({ action: z.literal("classify_todo") }),
  z.object({ action: z.literal("classify"), ids: z.array(z.string().uuid()).min(1).max(CHUNK) }),
  // Nạp hàng loạt từ tệp Word: đọc từng nguồn (ảnh/đoạn chữ) thành nhiều đề -> tạo đợt nháp -> AI làm theo hai pha (make, finish) -> xác nhận mới lưu vào problems.
  z.object({ action: z.literal("read_items"), image: z.string().max(6_000_000, "Ảnh quá lớn.").regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Chỉ nhận ảnh png, jpeg, webp.").optional(), text: z.string().min(20, "Đoạn chữ quá ngắn.").max(20_000).optional() }).refine((x) => !!x.image !== !!x.text, "Gửi một ảnh hoặc một đoạn chữ."),
  z.object({ action: z.literal("batch_start"), file_name: z.string().max(200), grade, sources: z.number().int().min(0).max(500), read_errors: z.array(z.object({ name: z.string().max(100), reason: z.string().max(500) })).max(100),
    items: z.array(z.object({ statement: z.string().trim().min(15, "Có đề quá ngắn.").max(6000), answers: z.record(z.string(), z.unknown()), steps: z.array(z.string().max(1000)).max(30) })).min(1, "Chưa có đề nào.").max(80, "Tối đa 80 đề mỗi đợt.") }),
  z.object({ action: z.literal("batch_make"), id: z.string().uuid(), idx: z.array(z.number().int().min(0)).min(1).max(CHUNK) }),
  z.object({ action: z.literal("batch_finish"), id: z.string().uuid(), idx: z.array(z.number().int().min(0)).min(1).max(CHUNK) }),
  z.object({ action: z.literal("batch_confirm"), id: z.string().uuid() }),
  z.object({ action: z.literal("batch_cancel"), id: z.string().uuid() }),
  z.object({ action: z.literal("complete"), problem: z.unknown() }),
  z.object({ action: z.literal("standardize_draft"), problem: z.unknown() }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
  z.object({ action: z.literal("rename"), id: z.string().uuid(), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9._-]{1,20}$/, "Mã đề gồm chữ và số, tối đa 20 ký tự.") }),
]);
export type Body = z.infer<typeof body>;
