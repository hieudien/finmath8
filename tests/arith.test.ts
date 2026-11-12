import { describe, expect, it } from "vitest";
import { badClaims, calc } from "../lib/chat/arith";

describe("calc", () => {
  it("tính đúng thứ tự phép tính và ngoặc", () => {
    expect(calc("30*10000*(1-0.1)+0")).toBe(270000);
    expect(calc("2+3*4")).toBe(14);
    expect(calc("2+")).toBeNull();
  });
});

describe("badClaims (tầng 0)", () => {
  it("bắt so sánh đảo chiều (phiên 7e4114df)", () => {
    expect(badClaims("mua ở B rẻ hơn do 270000 > 275000")).toEqual(["270000 > 275000"]);
    expect(badClaims("mua ở B rẻ hơn do 270.000 < 275.000")).toEqual([]);
  });
  it("bắt phép tính sai, chấp nhận phép tính đúng và dấu phân cách nghìn", () => {
    expect(badClaims("30 x 10000 x 0,9 + 0 = 270000")).toEqual([]);
    expect(badClaims("30 x 10.000 x 0,85 + 20.000 = 275.000")).toEqual([]);
    expect(badClaims("30 x 10000 x 0,9 = 207000")).toHaveLength(1);
    expect(badClaims("3 + 4 = 8")).toHaveLength(1);
  });
  it("chuỗi đẳng thức xét từng cặp", () => {
    expect(badClaims("A = 3 + 4 = 7")).toEqual([]);
    expect(badClaims("A = 3 + 4 = 8")).toHaveLength(1);
  });
  it("không báo nhầm đại số, phần trăm, đơn vị", () => {
    expect(badClaims("2x - 3 = 5")).toEqual([]);
    expect(badClaims("x = 4")).toEqual([]);
    expect(badClaims("300000 x 15% = 45000")).toEqual([]);
    expect(badClaims("tổng là 30 quyển")).toEqual([]);
    expect(badClaims("y = 2x + 3 = 7")).toEqual([]);
  });
});

describe("badClaims: lời văn và mâu thuẫn chủ ý", () => {
  it("bắt phép sai dù có chữ đứng trước (cách nhau khoảng trắng)", () => {
    expect(badClaims("tiền ở A là 30 x 10000 x 0,9 = 207000")).toHaveLength(1);
    expect(badClaims("diện tích là 3 x 4 = 12 cm")).toEqual([]);
  });
  it("không báo lời văn kiểu '7 nhân 2 = 14' hay đẳng thức sai chủ ý để chỉ mâu thuẫn", () => {
    expect(badClaims("B = 7 nhân 2 = 14")).toEqual([]);
    expect(badClaims("Thu gọn ta được 6 = 5, đây là điều vô lý")).toEqual([]);
    expect(badClaims("Trừ vế với vế: 0 = 1 là điều vô lý nên hệ vô nghiệm")).toEqual([]);
  });
});

describe("badClaims: phân số", () => {
  it("không báo nhầm phân số đúng, vẫn bắt phân số sai", () => {
    expect(badClaims("1/3 + 1/3 + 1/3 = 1")).toEqual([]);
    expect(badClaims("3/2 + 1/2 = 2")).toEqual([]);
    expect(badClaims("3/2 + 1/2 = 3")).toHaveLength(1);
  });
});

describe("badClaims: nghiệm suy ra phải thỏa phương trình ngay trước", () => {
  it("bắt '7x = 28 nên x = 3', '10 - 6y = 5 nên y = 0,5', không báo bước đúng", () => {
    expect(badClaims("Cộng với phương trình thứ nhất: 7x = 28 nên x = 3")).toHaveLength(1);
    expect(badClaims("Cộng vế với vế: 19x = 36 nên x = 2")).toHaveLength(1);
    expect(badClaims("Thế vào: 2(5 - 4y) - 2y = 5 nên 10 - 6y = 5 nên y = 0,5")).toHaveLength(1);
    expect(badClaims("Cộng với phương trình thứ nhất: 7x = 21 nên x = 3")).toEqual([]);
    expect(badClaims("5x - 3(12 - 3x)/2 = 1 nên 10x - 36 + 9x = 2 nên 19x = 38 nên x = 2")).toEqual([]);
    expect(badClaims("Thế vào: 2(5 - 4y) - 2y = 5 nên 10 - 10y = 5 nên y = 0,5")).toEqual([]);
    expect(badClaims("3x + 2y = 12 nên x = 2")).toEqual([]); // hai ẩn: không xét
  });
});
