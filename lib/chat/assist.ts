import { stripStep, type Cp } from "@/lib/chat/progress";
import { reveal } from "@/lib/chat/canned";

// Hết mức gợi ý mà học sinh vẫn kẹt STALL_LIMIT lượt thì bot hiện lời giải của phần chưa làm đầu tiên (không có nút xem lời giải: học sinh tự giải thì không thấy).
// Mỗi lần hiện qua đúng một mốc của lời giải nên đề luôn kết thúc. Bước được giải hộ ghi vào chat_sessions.revealed để chấm điểm đúng.
export const STALL_LIMIT = 5;
export const MAX_HINT = { steps: 3 } as const;

// stall chỉ tăng khi đã hết gợi ý và lượt đó không qua mốc; qua mốc thì về 0.
// near: lượt nộp gần đúng (đúng hướng nhưng thiếu, hoặc chỉ sai một chỗ): không tính là kẹt nên không đẩy học sinh tới màn hiện lời giải.
export function ladder(mode: keyof typeof MAX_HINT, hint: number, stall: number, progressed: boolean, near = false) {
  if (progressed) return { stall: 0, reveal: false };
  if (near) return { stall, reveal: false };
  if (hint < MAX_HINT[mode]) return { stall, reveal: false };
  const n = stall + 1;
  return { stall: n, reveal: n >= STALL_LIMIT };
}

export const stepText = (c: Cp) => stripStep(c.label);
export const revealLine = (c: Cp) => reveal(stepText(c));
export const reviewText = (items: string[]) => (items.length ? `\n\nGợi ý ôn tập:\n${items.map((x) => `- ${x}`).join("\n")}` : "");

// Trần điểm mỗi tiêu chí (0-3) theo số lần bot hiện lời giải: mỗi lần hiện trừ 1, không phụ thuộc số bước của đề (chia bước thô hay vụn đều như nhau).
export const revealCap = (times: number) => Math.max(0, 3 - times);
