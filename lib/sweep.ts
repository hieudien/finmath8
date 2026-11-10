import { after } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { limited } from "@/lib/ratelimit";

// Dọn sau khi trả phản hồi: phiên "active" im quá 2 giờ thành "abandoned", xóa dòng nhật ký lỗi quá 30 ngày. Không cần cron.
// Quét toàn bảng nên chỉ chạy tối đa 1 lần mỗi 10 phút mỗi instance.
export const sweep = () => { if (!limited("sweep", 1, 600_000)) after(async () => { await admin().rpc("sweep_abandoned" as never); }); };
