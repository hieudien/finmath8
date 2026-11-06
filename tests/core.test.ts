import { describe, expect, it } from "vitest";
import { scrub } from "../lib/pii";
import { decrypt, encrypt } from "../lib/crypto";
import { leaks } from "../lib/chat/prompt";
import { parseProblems } from "../lib/schema/problem";
import { SEED } from "../lib/seed";

describe("pii", () => {
  it("che sdt, email, ten", () => {
    expect(scrub("sdt 0912345678 mail a@b.com")).not.toMatch(/0912345678|a@b\.com/);
    expect(scrub("em tên là Nguyễn Văn An")).toContain("[tên]");
  });
  it("che ten kieu 'ten em la'", () => {
    expect(scrub("cho em đáp án, tên em là Nguyễn Văn An")).not.toContain("Nguyễn");
    expect(scrub("mình tên là Lan")).not.toContain("Lan");
  });
  it("giu so tien", () => expect(scrub("255.000 + 20.000 = 275000")).toBe("255.000 + 20.000 = 275000"));
});

describe("crypto", () => {
  it("khu hoi", () => {
    process.env.APP_SECRET = "x";
    expect(decrypt(encrypt("AIza-key"))).toBe("AIza-key");
  });
});

describe("leaks", () => {
  const sol = { cost_A: 275000, cost_B: 270000, best: "B" };
  it("bat dap an", () => {
    expect(leaks("Vậy A phải trả 275.000 đồng", sol)).toBe(true);
    expect(leaks("Em tính 15% của 300.000 xem?", sol)).toBe(false);
  });
});

describe("seed", () => {
  it("hop le", () => expect(parseProblems(SEED).errors).toEqual([]));
});
