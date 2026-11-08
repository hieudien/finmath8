import { z } from "zod";
import { askJson, type LlmCfg } from "@/lib/llm";
import { leaks } from "@/lib/chat/prompt";
import type { Problem } from "@/lib/schema/problem";

export const GREETING_FALLBACK = "Chào bạn! Mình sẽ cùng bạn giải bài này từng bước. Bạn đọc đề rồi cho mình biết đề yêu cầu tìm gì nhé?";

const system = (p: Problem) => `Bạn viết LỜI CHÀO ĐẦU TIÊN của chatbot dạy Toán cho bài dưới đây. Xưng "mình", gọi học sinh là "bạn" (không dùng "em", "tôi"). Giọng thân thiện.
Gồm: một lời chào ngắn, rồi MỘT câu hỏi CỤ THỂ để học sinh bắt đầu (hỏi đề yêu cầu tìm gì, hoặc đại lượng đầu tiên cần xác định), trả lời được bằng một cụm ngắn. Tối đa 2 câu và 35 từ. KHÔNG nêu đáp án, kết quả hay phép tính ra kết quả. Không lặp lại cả đề.
Đề: ${p.title}. ${p.statement ?? ""}
Đáp án (bí mật): ${JSON.stringify(p.solution)}
Chỉ trả JSON {"greeting":string}`;

const out = z.object({ greeting: z.string().min(5) });

// AI viết, server kiểm tra không lộ số đáp án. Thử tối đa 2 lần; không được thì để trống (engine dùng câu dự phòng).
export async function makeGreeting(cfg: LlmCfg, p: Problem): Promise<string> {
  for (let i = 0; i < 2; i++) {
    const r = await askJson(cfg, system(p), [{ role: "user", text: "Viết lời chào." }], out, { maxTokens: 200 });
    const g = r.greeting.trim();
    if (!leaks(g, p.solution, [p.data, p.statement], p.solution_steps) && /\?\s*$/.test(g)) return g;
  }
  return "";
}
