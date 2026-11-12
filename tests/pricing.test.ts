import { describe, expect, it } from "vitest";
import { costUsd, outBilled, purposeInfo, sumUses, type UsageRow } from "../lib/pricing";

const row = (o: Partial<UsageRow>): UsageRow => ({ provider: "gemini", model: "m", use: "chat", calls: 1, input: 1_000_000, cached: 0, output: 1_000_000, thoughts: 0, ...o });
const p = { in: 1, cached: 0.5, out: 4 };

describe("sumUses", () => {
  it("chi cong dong thuoc tap use, token gom thoughts cua Gemini", () => {
    const rows = [row({ use: "chat", calls: 2, thoughts: 1_000_000 }), row({ use: "advise" }), row({ use: "eval" })];
    expect(sumUses(rows, ["chat", "eval"], () => 10)).toEqual({ calls: 3, tokens: 3_000_000 + 2_000_000, vnd: 20 });
  });
});

describe("costUsd", () => {
  it("tinh input khong cache va output", () => {
    expect(costUsd(row({}), p)).toBe(5);
  });
  it("input cache tinh gia cache", () => {
    expect(costUsd(row({ cached: 400_000 }), p)).toBeCloseTo(0.6 + 0.2 + 4);
  });
  it("Gemini cong them thoughts vao output", () => {
    expect(outBilled(row({ thoughts: 500_000 }))).toBe(1_500_000);
  });
  it("nhan la thi vao nhom Chua ro", () => {
    expect(purposeInfo("chat")[1]).toBe("Học sinh làm bài");
    expect(purposeInfo("")[1]).toBe("Chưa rõ");
    expect(purposeInfo("xyz")[1]).toBe("Chưa rõ");
  });
});
