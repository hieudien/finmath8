import { describe, it, expect } from "vitest";
import { checkpoints, markByNumbers } from "../lib/chat/progress";

// BT54580 (phiên dca9d665): x=4 không được ghi nhận nhiều bước cùng lúc, và không nhảy cóc.
const p = {
  data: { phuong_trinh_1: "3x + 2y = 6", phuong_trinh_2: "2x - 2y = 14" },
  statement: "Giải hệ phương trình sau bằng phương pháp cộng đại số: $\begin{cases} 3x + 2y = 6 \\ 2x - 2y = 14; \end{cases}$",
  solution: { x: 4, y: -3 },
  solution_steps: ["Cộng từng vế của hai phương trình trong hệ ta được phương trình mới: (3x + 2y) + (2x - 2y) = 6 + 14.", "Thu gọn phương trình trên ta được 5x = 20, suy ra x = 4.", "Thay x = 4 vào phương trình thứ nhất ta có: 3 \cdot 4 + 2y = 6.", "Biến đổi và giải phương trình ta được 12 + 2y = 6, suy ra 2y = -6 và y = -3.", "Vậy hệ phương trình có nghiệm duy nhất là (x; y) = (4; -3)."],
  step_checks: [{ result: "(3x + 2y) + (2x - 2y) = 6 + 14", accepts: ["(3x+2y)+(2x-2y)=6+14"] }, { result: "x = 4", accepts: ["x=4"] }, { result: "3 \cdot 4 + 2y = 6", accepts: ["3*4 + 2y = 6", "3.4 + 2y = 6"] }, { result: "y = -3", accepts: ["y=-3"] }, { result: "(x; y) = (4; -3)", accepts: ["(4; -3)", "x = 4, y = -3", "x=4, y=-3"] }],
} as never;

describe("thu tu buoc", () => {
  const cps = checkpoints(p);
  it("x=4 khi buoc 1 chua xong: khong ghi nhan", () => expect(markByNumbers("5x = 20\nx = 4", cps, 0)).toBe(0));
  it("buoc 1 xong roi x=4: chi buoc 2", () => expect(markByNumbers("x = 4", cps, 0b1)).toBe(0b11));
  it("x=4 o buoc 3: khong ghi nhan buoc 3/5", () => expect(markByNumbers("x = 4", cps, 0b11)).toBe(0b11));
  it("buoc 3 dung chu", () => expect(markByNumbers("3 . 4 + 2y = 6", cps, 0b11)).toBe(0b111));
});

describe("de khong co step_checks", () => {
  const q = { ...(p as object), step_checks: [] } as never;
  const cps = checkpoints(q);
  it("x=4 sau buoc 1 chi ghi nhan buoc 2, khong day sang buoc 3/5", () => expect(markByNumbers("x = 4", cps, 0b1)).toBe(0b11));
});
