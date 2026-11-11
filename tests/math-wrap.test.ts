import { describe, it, expect } from "vitest";
import { wrapMath, wrapRecord } from "../lib/math-wrap";
import { asFraction } from "../lib/problem-text";

describe("phân số", () => {
  it("a/b được dựng thành \\frac", () => {
    expect(wrapMath("2/5")).toBe("$\\frac{2}{5}$");
    expect(wrapMath("-1/6")).toBe("$-\\frac{1}{6}$");
    expect(wrapMath("1/0")).toBe("1/0");
  });
  it("số làm tròn dài hiện lại thành phân số, số ngắn giữ nguyên", () => {
    expect(asFraction(0.166667)).toBe("$\\frac{1}{6}$");
    expect(asFraction(4.666667)).toBe("$\\frac{14}{3}$");
    expect(asFraction(0.4)).toBeNull();
    expect(asFraction(0.17)).toBeNull();
  });
});

describe("wrapMath", () => {
  it("bọc LaTeX trần", () => {
    expect(wrapMath("\\frac{4}{x+y} + \\frac{1}{y-1} = 5")).toBe("$\\frac{4}{x+y} + \\frac{1}{y-1} = 5$");
    expect(wrapMath("x^{2}")).toBe("$x^{2}$");
  });
  it("giữ nguyên khi đã có $, số, chữ thường, chữ tiếng Việt", () => {
    expect(wrapMath("$\\frac{1}{2}$")).toBe("$\\frac{1}{2}$");
    expect(wrapMath("12.5")).toBe("12.5");
    expect(wrapMath("m khác -4")).toBe("m khác -4");
    expect(wrapMath("giải \\frac{1}{2}")).toBe("giải \\frac{1}{2}");
  });
  it("wrapRecord chỉ đổi chuỗi", () => {
    expect(wrapRecord({ a: "\\sqrt{2}", b: 3, c: "abc" })).toEqual({ a: "$\\sqrt{2}$", b: 3, c: "abc" });
  });
});
