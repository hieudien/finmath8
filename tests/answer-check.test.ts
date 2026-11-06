import { describe, expect, it } from "vitest";
import { missingAnswers } from "@/lib/answer-check";

describe("missingAnswers", () => {
  it("khớp số có dấu ngăn nghìn kiểu Việt", () => {
    expect(missingAnswers({ tong: 2400000 }, ["Vay 2.400.000 đồng."])).toEqual([]);
  });
  it("không khớp theo chuỗi con (100 vs 1000)", () => {
    expect(missingAnswers({ x: 100 }, ["Ra 1000 đồng."])).toEqual(["100"]);
  });
  it("không lấy số trong tên khóa", () => {
    expect(missingAnswers({ tuan_100: 9 }, ["9 tuần"])).toEqual([]);
  });
  it("số thập phân lớn", () => {
    expect(missingAnswers({ x: 1500.5 }, ["Được 1.500,5 đồng"])).toEqual([]);
    expect(missingAnswers({ x: 1500.5 }, ["Được 1500 đồng"])).toEqual(["1500.5"]);
  });
});
