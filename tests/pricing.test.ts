import { describe, expect, it } from "vitest";
import { costUsd, outBilled, purposeInfo, type UsageRow } from "../lib/pricing";

const row = (o: Partial<UsageRow>): UsageRow => ({ provider: "gemini", model: "m", use: "chat", calls: 1, input: 1_000_000, cached: 0, output: 1_000_000, thoughts: 0, ...o });
const p = { in: 1, cached: 0.5, out: 4 };

describe("costUsd", () => {
  it("tinh input khong cache va output", () => {
    expect(costUsd(row({}), p)).toBe(5);
  });
  it("input cache tinh gia cache", () => {
    expect(costUsd(row({ cached: 400_000 }), p)).toBeCloseTo(0.6 + 0.2 + 4);
  });
  it("Gemini cong them thoughts, OpenAI thi khong", () => {
    expect(outBilled(row({ thoughts: 500_000 }))).toBe(1_500_000);
    expect(outBilled(row({ provider: "openai", thoughts: 500_000 }))).toBe(1_000_000);
  });
  it("nhan la thi vao nhom Chua ro", () => {
    expect(purposeInfo("chat")[1]).toBe("Học sinh làm bài");
    expect(purposeInfo("")[1]).toBe("Chưa rõ");
    expect(purposeInfo("xyz")[1]).toBe("Chưa rõ");
  });
});
