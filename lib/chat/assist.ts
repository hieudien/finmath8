import { stripStep, type Cp } from "@/lib/chat/progress";

// Còn dùng cho phiên cũ (đã có bước được giải hộ khi còn thang gợi ý theo bước): chấm điểm và lời ôn tập.
export const stepText = (c: Cp) => stripStep(c.label);
export const reviewText = (items: string[]) => (items.length ? `\n\nGợi ý ôn tập:\n${items.map((x) => `- ${x}`).join("\n")}` : "");

// Trần điểm mỗi tiêu chí (0-3) theo số lần bot hiện lời giải: mỗi lần hiện trừ 1.
export const revealCap = (times: number) => Math.max(0, 3 - times);
