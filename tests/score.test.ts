import { describe, expect, it } from "vitest";
import { avgTen, bandsTen, toTen } from "../lib/score";

describe("thang điểm 10", () => {
  it("quy đổi 0–12 sang 0–10, làm tròn 0,5", () => {
    expect([0, 1, 2, 3, 6, 9, 11, 12].map(toTen)).toEqual([0, 1, 1.5, 2.5, 5, 7.5, 9, 10]);
  });
  it("trung bình giữ 1 chữ số thập phân", () => {
    expect(avgTen(7.3)).toBe(6.1);
    expect(avgTen(0)).toBe(0);
  });
  it("gom khoảng", () => {
    const b = bandsTen([{ name: "0", value: 1 }, { name: "5", value: 2 }, { name: "6", value: 3 }, { name: "12", value: 4 }]);
    // 0→0 (0–2), 5→4 (2,5–4), 6→5 (4,5–6), 12→10 (8,5–10)
    expect(b.map((x) => x.value)).toEqual([1, 2, 3, 0, 4]);
  });
});
