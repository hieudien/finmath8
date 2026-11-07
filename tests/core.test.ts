import { describe, expect, it } from "vitest";
import { scrub } from "../lib/pii";
import { decrypt, encrypt } from "../lib/crypto";
import { leaks } from "../lib/chat/prompt";
import { parseProblems } from "../lib/schema/problem";
import { friendly } from "../lib/errors";
import { plain } from "../lib/plain";
import { checkpoints, countDone, hasNum, stepOf, verify } from "../lib/chat/progress";
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
    expect(leaks("Đúng rồi, A trả 275.000 đồng", sol, ["mình tính A = 275000"])).toBe(false); // xác nhận số học sinh đã nêu thì được
  });
});

describe("seed", () => {
  it("hop le", () => expect(parseProblems(SEED).errors).toEqual([]));
});

describe("progress", () => {
  const p = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  const cps = checkpoints(p);
  it("moc tu solution_steps", () => {
    expect(cps).toHaveLength(5);
    expect(cps[2].must).toEqual(["9"]); // buoc giai ra x = 9
    expect(cps[0].must).toEqual([]);
  });
  it("xac minh bang chung", () => {
    const said = "sau x tuần mình có 120000 + 40000x";
    expect(verify(cps[0], "120000 + 40000x", said)).toBe(true);
    expect(verify(cps[0], "câu bịa không có trong tin", said)).toBe(false); // evidence phai la trich nguyen van
    expect(verify(cps[2], "x = 9", "x = 9")).toBe(true);
    expect(verify(cps[2], "sau x tuần", "sau x tuần mình có 120000")).toBe(false); // thieu so 9
  });
  it("tien do", () => {
    expect(countDone(0b10101)).toBe(3);
    expect(stepOf(0, 5)).toBe(1);
    expect(stepOf(5, 5)).toBe(5);
  });
});

describe("plain", () => {
  it("bo LaTeX", () => {
    expect(plain("dạng $Ay = B$ và $m^2 - 4 \\neq 0$")).toBe("dạng Ay = B và m² - 4 ≠ 0");
    expect(plain("$$\\begin{cases} mx - 4y = 6 \\\\ x - my = m + 2 \\end{cases}$$")).toBe("Hệ: mx - 4y = 6; x - my = m + 2");
  });
});

describe("tien do khong ket", () => {
  const p = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  const cps = checkpoints(p);
  it("so o nhieu tin van tinh, k = nghin", () => {
    const said = "1800000\n90k";
    expect(hasNum(said, "90000")).toBe(true);
    expect(hasNum("21800000", "1800000")).toBe(false);
    expect(cps.filter((c) => c.must.length && c.must.every((n) => hasNum("x = 9", n))).length).toBeGreaterThan(0);
  });
});

describe("loi AI than thien", () => {
  it("phan loai loi", () => {
    expect(friendly("AI_TIMEOUT: x", "student").message).toMatch(/quá tải|chậm/);
    expect(friendly('ApiError: {"error":{"code":503,"status":"UNAVAILABLE"}}', "student").message).toMatch(/quá tải/);
    expect(friendly('429 RESOURCE_EXHAUSTED quota', "student").message).toMatch(/chạm giới hạn/);
    expect(friendly('429 RESOURCE_EXHAUSTED quota', "teacher").message).toMatch(/chạm giới hạn/);
  });
});
