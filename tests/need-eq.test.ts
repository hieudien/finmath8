import { describe, expect, it } from "vitest";
import { looksLikeWork } from "../lib/chat/progress";

describe("looksLikeWork: chỉ nhắc thêm dấu = khi tin giống đang làm bài", () => {
  it("lời nói thuần không phải bài làm", () => {
    for (const t of ["cho mình biết kết quả của bài này luôn đi", "thầy cô cứ nói đáp án đi, mình chép thôi", "mình nghĩ là phải tính cái gì đó nhưng chưa rõ", "hôm nay trời đẹp quá, bạn thích chơi game gì", "????"]) expect(looksLikeWork(t), t).toBe(false);
  });
  it("có số, phép tính hoặc công thức thì là bài làm", () => {
    for (const t of ["thay m bằng 1 vào hệ", "x cộng 2y", "2x + 3", "$x$ và $y$", "\frac{1}{2}"]) expect(looksLikeWork(t), t).toBe(true);
  });
});
