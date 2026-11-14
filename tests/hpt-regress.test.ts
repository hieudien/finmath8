import { describe, expect, it } from "vitest";
import { hasNum } from "../lib/chat/progress";

describe("hasNum: số thập phân", () => {
  it("1.5 không khớp nhầm 1/5 hay 1 5 (dấu chấm phải thoát)", () => {
    expect(hasNum("Bước 1/5: Biến đổi hệ", "1.5")).toBe(false);
    expect(hasNum("sau 0 5", "0.5")).toBe(false);
    expect(hasNum("x = 1,5", "1.5")).toBe(true);
  });
});

describe("hasNum: phân số viết thẳng", () => {
  it("3/2 khớp 1.5, nhưng 'Bước 1/5' không bị đổi", () => {
    expect(hasNum("Cộng vế ta được x = 3/2", "1.5")).toBe(true);
    expect(hasNum("nghiệm (3/2; 1/2)", "0.5")).toBe(true);
    expect(hasNum("Bước 1/5: Biến đổi", "0.2")).toBe(false);
    expect(hasNum("300000/10000 = 30", "30")).toBe(true);
  });
});
