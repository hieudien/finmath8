import { stripStep, type Cp } from "@/lib/chat/progress";

// Hết mức gợi ý mà học sinh vẫn kẹt STALL_LIMIT lượt thì bot hiện lời giải của bước hiện tại (không có nút xem lời giải: học sinh tự giải thì không thấy).
// Mỗi lần hiện qua đúng một bước nên đề luôn kết thúc. Bước được giải hộ ghi vào chat_sessions.revealed để chấm điểm đúng.
export const STALL_LIMIT = 5;
export const MAX_HINT = { steps: 3, chat: 4 } as const;
export const CLOSING_HELP = "Bài đã xong, nhưng mình đã giúp ở một số bước. Bạn xem lại lời giải rồi làm thử một bài tương tự nhé.";

// stall chỉ tăng khi đã hết gợi ý và lượt đó không qua mốc; qua mốc thì về 0.
export function ladder(mode: keyof typeof MAX_HINT, hint: number, stall: number, progressed: boolean) {
  if (progressed) return { stall: 0, reveal: false };
  if (hint < MAX_HINT[mode]) return { stall, reveal: false };
  const n = stall + 1;
  return { stall: n, reveal: n >= STALL_LIMIT };
}

export const stepText = (c: Cp) => stripStep(c.label);
export const revealLine = (c: Cp, n: number) => `Bước này khó với bạn lúc này, mình đưa lời giải bước ${c.id + 1}/${n} để bạn đi tiếp nhé: ${stepText(c)}`;
export const reviewText = (items: string[]) => (items.length ? `\n\nGợi ý ôn tập:\n${items.map((x) => `- ${x}`).join("\n")}` : "");

export const countBits = (mask: number, cps: Cp[]) => cps.filter((c) => mask >> c.id & 1).length;
// Trần điểm mỗi tiêu chí (0-3) theo tỉ lệ bước học sinh tự làm: chỉ phần tự làm được tính điểm.
export const scoreCap = (cps: Cp[], revealed: number) => (cps.length ? Math.ceil((3 * (cps.length - countBits(revealed, cps))) / cps.length) : 3);
