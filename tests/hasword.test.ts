import { describe, expect, it } from "vitest";
import { hasWord, markByNumbers, type Cp } from "../lib/chat/progress";

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

describe("markByNumbers: gộp nhiều mốc trong một tin chỉ khi có số mới", () => {
  const cp = (id: number, o: Partial<Cp>): Cp => ({ id, label: `b${id}`, anchors: [], must: [], ...o });
  it("ba mốc cùng dựa vào số 10: chỉ ghi nhận mốc đầu (lỗi g5-ok, g6-ok)", () => {
    const cps = [cp(0, { must: ["10"] }), cp(1, { words: ["x=10"] }), cp(2, { must: ["10"] })];
    expect(markByNumbers("nghiệm x=10 hoặc x=-12", cps, 0)).toBe(0b001);
  });
  it("mốc sau có số mới thì vẫn gộp (tin làm đúng hai bước liền)", () => {
    const cps = [cp(0, { must: ["4"] }), cp(1, { must: ["8"] }), cp(2, { must: ["7"] })];
    expect(markByNumbers("được 4 rồi 8", cps, 0)).toBe(0b011);
  });
  it("mốc không có số (chữ thuần) vẫn gộp được", () => {
    const cps = [cp(0, { must: ["4"] }), cp(1, { words: ["vônghiệm"] })];
    expect(markByNumbers("có 4 và vô nghiệm", cps, 0)).toBe(0b11);
  });
  it("không bỏ qua mốc chưa xong: mốc đầu không khớp thì không ghi nhận gì", () => {
    const cps = [cp(0, { must: ["4"] }), cp(1, { must: ["8"] })];
    expect(markByNumbers("chỉ có 8", cps, 0)).toBe(0);
  });
});
