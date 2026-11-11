import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/llm", () => ({ askJson: vi.fn() }));
import { auditVerdict } from "../lib/verify-solution";

describe("auditVerdict", () => {
  it("ok -> không lỗi", () => expect(auditVerdict({ ok: true })).toBe(""));
  it("tự mâu thuẫn (sai = đúng) -> bỏ", () => expect(auditVerdict({ ok: false, step: 6, wrong: "y = -3", right: "y=-3" })).toBe(""));
  it("thiếu chỗ đúng -> bỏ", () => expect(auditVerdict({ ok: false, step: 2, wrong: "x = 1", right: "" })).toBe(""));
  it("lỗi thật -> mô tả", () => expect(auditVerdict({ ok: false, step: 7, wrong: "x = 16", right: "x = 22" })).toBe("Bước 7: x = 16. Đúng phải là x = 22."));
});
