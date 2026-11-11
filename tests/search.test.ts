import { describe, it, expect } from "vitest";
import { matchText } from "../lib/search";

describe("matchText", () => {
  it("bỏ dấu và không phân biệt hoa thường", () => {
    expect(matchText("TC04 giải hpt", "giai HPT")).toBe(true);
    expect(matchText("Đường thẳng", "duong")).toBe(true);
  });
  it("nhiều từ phải khớp hết", () => {
    expect(matchText("giải hệ phương trình", "he trinh")).toBe(true);
    expect(matchText("giải hệ phương trình", "he parabol")).toBe(false);
  });
  it("rỗng thì khớp tất cả", () => {
    expect(matchText("abc", "  ")).toBe(true);
  });
});
