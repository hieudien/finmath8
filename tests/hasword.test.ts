import { describe, expect, it } from "vitest";
import { hasWord } from "../lib/chat/progress";

describe("hasWord: không khớp khi chữ số đứng ngay trước (hệ số)", () => {
  it("y=1 không khớp trong 2y=1 và 3y=1 (lỗi thật ở phiên 60b7060e)", () => {
    expect(hasWord("x+2y=1+3", "y=1")).toBe(false);
    expect(hasWord("2x-3y=1", "y=1")).toBe(false);
    expect(hasWord("$\begin{cases}2x+4y=8\\ 2x-3y=1\end{cases}$", "y=1")).toBe(false);
    expect(hasWord("x - y = 1", "y=1")).toBe(false); // x-y=1 là -y=1
    expect(hasWord("x + y = 1", "y=1")).toBe(false); // một tổng, không phải y=1
  });
  it("vẫn khớp khi viết đúng dạng chuẩn", () => {
    expect(hasWord("y=1", "y=1")).toBe(true);
    expect(hasWord("Vậy y = 1", "y=1")).toBe(true);
    expect(hasWord("x=2, y=1", "y=1")).toBe(true);
    expect(hasWord("trừ vế với vế được 7y=7 nên y=1", "y=1")).toBe(true);
    expect(hasWord("(2;1)", "(2;1)")).toBe(true);
    expect(hasWord("Vậy y = 1", "y=1")).toBe(true); // "Vậy" kết thúc bằng chữ y nhưng là chữ cái, không bị chặn
    expect(hasWord("x=-2", "x=-2")).toBe(true);
  });
  it("không khớp số dính vào số lớn hơn, cả hai phía", () => {
    expect(hasWord("x=25", "x=2")).toBe(false);
    expect(hasWord("x=2.5", "x=2")).toBe(false);
    expect(hasWord("12", "2")).toBe(false);
    expect(hasWord("x=2.", "x=2")).toBe(true);
  });
});
