import { describe, expect, it } from "vitest";
import { scrub } from "../lib/pii";
import { decrypt, encrypt } from "../lib/crypto";
import { chatState, leaks } from "../lib/chat/prompt";
import { parseProblems } from "../lib/schema/problem";
import { friendly } from "../lib/errors";
import { plain } from "../lib/plain";
import { earlyClose, checkpoints, countDone, hasNum, offStreak, OFF_REPLIES, sim, stepOf, tighten, verdict, verify } from "../lib/chat/progress";
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
  it("thieu secret thi bao loi", () => {
    delete process.env.APP_SECRET;
    expect(() => encrypt("x")).toThrow(/APP_SECRET/);
  });
  it("khu hoi", () => {
    process.env.APP_SECRET = "test-secret-0123456789";
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

describe("may kiem so hoc sinh", () => {
  const p = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  const cps = checkpoints(p);
  it("khop va khong khop", () => {
    const v = verdict("x = 9 va con 7777", p, cps);
    expect(v.match).toContain("9");
    expect(v.miss).toContain("7777");
    expect(verdict("em khong biet", p, cps)).toEqual({ match: [], miss: [] });
  });
  it("chatState chi them dong kiem khi co so", () => {
    expect(chatState(cps, 0, 1)).not.toContain("Máy kiểm");
    expect(chatState(cps, 0, 1, { match: ["9"], miss: [] })).toContain("khớp lời giải: 9");
  });
});

describe("giao tiep: dai, lap, lac de", () => {
  it("tighten giu cau dau va cau hoi cuoi, khong cat so thap phan", () => {
    const long = "Đúng rồi, lãi suất là 0.85 phần trăm. " + "Từ này chỉ để làm dài thêm câu trả lời của bạn. ".repeat(6) + "Bạn tính tiếp số tiền lãi nhé?";
    const t = tighten(long);
    expect(t.startsWith("Đúng rồi, lãi suất là 0.85 phần trăm.")).toBe(true);
    expect(t.endsWith("nhé?")).toBe(true);
    expect(tighten("Ngắn thôi. Bạn tính nhé?")).toBe("Ngắn thôi. Bạn tính nhé?");
  });
  it("sim bat cau lap", () => {
    expect(sim("Bạn viết phép tính ra số tiền còn thiếu nhé?", "Bạn viết phép tính ra số tiền còn thiếu nhé?")).toBe(1);
    expect(sim("Bạn viết phép tính số tiền còn thiếu?", "Giải phương trình để tìm x nào?")).toBeLessThan(0.3);
  });
  it("thang lac de dem lien tiep", () => {
    const m = (role: string, content: string) => ({ role, content });
    expect(offStreak([m("bot", "x"), m("student", "a")])).toBe(0);
    expect(offStreak([m("bot", OFF_REPLIES[0]), m("student", "hi"), m("bot", OFF_REPLIES[1]), m("student", "hi")])).toBe(2);
    expect(offStreak([m("bot", OFF_REPLIES[0]), m("student", "ok"), m("bot", "binh thuong"), m("student", "hi")])).toBe(0);
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

describe("latex trong tin hoc sinh", () => {
  it("phan so, so mu duoc chuan hoa de so voi dap an", () => {
    expect(hasNum(String.raw`x = $\frac{1}{2}$`, "0.5")).toBe(true);
    expect(hasNum(String.raw`$\frac{-3}{4}$`, "0.75")).toBe(true);
    expect(hasNum(String.raw`$x=\frac12+3^2$`, "0.5")).toBe(true); // MathLive viết \frac12 không ngoặc
    expect(hasNum("$x^{2} = 9$", "2")).toBe(false); // so mu khong tinh la so rieng
    expect(hasNum("$x = 12$", "12")).toBe(true);
  });
});

describe("read_image", () => {
  const re = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
  it("chi nhan anh base64", () => {
    expect(re.test("data:image/png;base64,iVBORw0=")).toBe(true);
    expect(re.test("data:image/svg+xml;base64,AAAA")).toBe(false);
    expect(re.test("data:text/html;base64,AAAA")).toBe(false);
  });
});

describe("loi ket som", () => {
  it("chan loi chuc mung khi chua xong", () => {
    expect(earlyClose("Bài toán đã được giải xong. Chúc mừng bạn!")).toBe(true);
    expect(earlyClose("Chúc mừng! Bạn đã đúng, giờ giải thích cách làm?")).toBe(true);
    expect(earlyClose("Bạn viết bước tiếp theo nhé?")).toBe(false);
  });
});
