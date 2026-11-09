import { describe, expect, it } from "vitest";
import { scrub } from "../lib/pii";
import { decrypt, encrypt } from "../lib/crypto";
import { chatState, leaks } from "../lib/chat/prompt";
import { parseProblems } from "../lib/schema/problem";
import { friendly } from "../lib/errors";
import { plain } from "../lib/plain";
import { missingInfo } from "../lib/ready";
import { ladder, revealLine, scoreCap, STALL_LIMIT } from "../lib/chat/assist";
import { ASK_METHOD, ASK_NEXT, keepOrAsk, earlyClose, checkpoints, countDone, hasNum, markByNumbers, offStreak, OFF_REPLIES, sim, stepOf, tighten, verdict, verify } from "../lib/chat/progress";
import { SEED } from "../lib/seed";
import { DEFAULT_MODE, isMode, modeFor, STEPS_GREETING } from "../lib/modes";
import { choiceOptions, hasChoices, hasGuides, stepGoal, stepsGreeting } from "../lib/chat/goals";
import { validChoice } from "../lib/step-guides";
import { machineCheck, recent } from "../lib/chat/steps";

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

describe("buoc khong co so", () => {
  const base = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  const p = { ...base, statement: "Giải hệ 3x + 2y = 6, 2x - 2y = 14", data: {}, solution: { x: 4 }, solution_steps: ["Bước 1: Hệ số của $y$ là $2$ và $-2$, đối nhau.", "Bước 2: Cộng vế ta được $5x = 20$, suy ra $x = 4$."] };
  it("anchors bo so thu tu buoc; tra loi bang chu van duoc xac minh", () => {
    const cps = checkpoints(p);
    expect(cps[0].anchors).not.toContain("1");
    expect(cps[0].must).toEqual([]);
    expect(verify(cps[0], "đối nhau", "đối nhau")).toBe(true);
    expect(verify(cps[0], "không có trong tin", "đối nhau")).toBe(false);
  });
});

describe("thang goi y: hien loi giai khi ket", () => {
  const cp = (id: number) => ({ id, label: `Bước ${id + 1}: làm việc ${id}`, anchors: [], must: [] });
  it("ladder chi dem khi het goi y, qua moc thi reset, du luot thi hien", () => {
    expect(ladder("steps", 1, 0, false)).toEqual({ stall: 0, reveal: false }); // chua het goi y: khong dem
    expect(ladder("steps", 3, 0, false)).toEqual({ stall: 1, reveal: false });
    expect(ladder("steps", 3, STALL_LIMIT - 1, false)).toEqual({ stall: STALL_LIMIT, reveal: true });
    expect(ladder("steps", 3, 4, true)).toEqual({ stall: 0, reveal: false });
    expect(ladder("chat", 3, 4, false).reveal).toBe(false); // chat het goi y o muc 4
    expect(ladder("chat", 4, 4, false).reveal).toBe(true);
  });
  it("scoreCap: chi tinh phan tu lam", () => {
    const cps = [cp(0), cp(1), cp(2), cp(3)];
    expect(scoreCap(cps, 0)).toBe(3);
    expect(scoreCap(cps, 0b0100)).toBe(3); // 3/4 tu lam: ceil(2.25) = 3
    expect(scoreCap(cps, 0b0110)).toBe(2);
    expect(scoreCap(cps, 0b1111)).toBe(0);
  });
  it("revealLine bo tien to Buoc N", () => {
    expect(revealLine(cp(1), 4)).toContain("làm việc 1");
    expect(revealLine(cp(1), 4)).not.toMatch(/Bước 2:/);
  });
});

describe("keepOrAsk", () => {
  it("giu loi AI co cau hoi, noi cau hoi khi thieu, dung cau mau khi la loi ket", () => {
    expect(keepOrAsk("Cách nhân hệ số của bạn hợp lý! Sau khi trừ vế, bạn được gì?", false)).toContain("hợp lý");
    expect(keepOrAsk("Cách của bạn hợp lý.", false)).toMatch(/hợp lý\. Bạn thử viết bước tiếp/);
    expect(keepOrAsk("Chúc mừng bạn!", false)).toBe(ASK_NEXT);
    expect(keepOrAsk("Chúc mừng bạn!", true)).toBe(ASK_METHOD);
  });
});

describe("missingInfo", () => {
  const base = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  const full = { ...base, solution: { x: 4 }, solution_steps: ["a", "b"], step_goals: ["a", "b"], step_hints: [["h"], ["h"]] };
  it("du thi rong, thieu thi liet ke", () => {
    expect(missingInfo(full)).toEqual([]);
    expect(missingInfo({ ...full, solution: {} })).toEqual(["đáp án"]);
    expect(missingInfo({ ...full, solution_steps: [], step_goals: [], step_hints: [] })).toEqual(["lời giải từng bước", "chỉ dẫn và gợi ý từng bước"]);
    expect(missingInfo({ ...full, step_goals: [] })).toEqual(["chỉ dẫn và gợi ý từng bước"]);
    expect(missingInfo({ nonsense: 1 })).toEqual(["đề lưu sai định dạng"]);
  });
});

describe("kieu tuong tac", () => {
  const p = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  it("isMode chi nhan kieu hop le", () => {
    expect(isMode("steps")).toBe(true);
    expect(isMode("toString")).toBe(false);
    expect(isMode(undefined)).toBe(false);
    expect(DEFAULT_MODE).toBe("chat");
  });
  it("de thieu loi giai tung buoc chay chat", () => {
    expect(modeFor("steps", { solution_steps: [] })).toBe("chat");
    expect(modeFor("steps", { solution_steps: ["a"] })).toBe("steps");
    expect(modeFor("chat", { solution_steps: ["a"] })).toBe("chat");
  });
  it("markByNumbers: nhay coc van duoc ghi nhan, gop buoc", () => {
    const cp = (id: number, must: string[]) => ({ id, label: "", anchors: must, must });
    const cps = [cp(0, ["8"]), cp(1, ["4"]), cp(2, [])];
    expect(markByNumbers("chưa biết", cps, 0)).toBe(0);
    expect(markByNumbers("2x = 8", cps, 0)).toBe(0b001); // buoc 1 xong
    expect(markByNumbers("x = 4", cps, 0)).toBe(0b010); // nhay coc: ghi nhan buoc 2, buoc 1 van thieu
    expect(markByNumbers("2x = 8 nên x = 4", cps, 0)).toBe(0b011); // gop 2 buoc
    expect(markByNumbers("x = 4", cps, 0b001)).toBe(0b011);
    expect(markByNumbers("mọi số", cps, 0b011)).toBe(0b011); // buoc 3 khong co so: cho AI, server khong tu xac nhan
  });
});

describe("chi dan tung buoc", () => {
  const base = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  const p = { ...base, statement: "Tìm x", data: {}, solution: { x: 4321 }, solution_steps: ["Tính 2x = 8642", "Vậy x = 4321"], step_goals: [] as string[], step_hints: [] as string[][] };
  it("hasGuides chi khi khop so buoc", () => {
    expect(hasGuides(p)).toBe(false);
    expect(hasGuides({ ...p, step_goals: ["a", "b"], step_hints: [["h"], ["h"]] })).toBe(true);
    expect(hasGuides({ ...p, step_goals: ["a"], step_hints: [["h"], ["h"]] })).toBe(false);
  });
  it("stepGoal: uu tien muc tieu, thieu thi goi y muc 1, lech thi rong", () => {
    expect(stepGoal({ ...p, step_goals: ["Tìm 2x", "Tìm x"], step_hints: [["g1"], ["g2"]] }, 0)).toBe("Tìm 2x");
    expect(stepGoal({ ...p, step_goals: [], step_hints: [["Nhìn vào vế trái"], ["g2"]] }, 0)).toBe("Nhìn vào vế trái");
    expect(stepGoal({ ...p, step_goals: ["chỉ một"], step_hints: [] }, 0)).toBe("");
    expect(stepGoal(p, 0)).toBe("");
  });
  it("stepGoal chan muc tieu lo dap an, cho nhac so hoc sinh da tim", () => {
    const q = { ...p, step_goals: ["Tìm x, kết quả là 4321", "Dùng 8642 để tìm x"], step_hints: [["a"], ["b"]] };
    expect(stepGoal(q, 0)).toBe("");
    expect(stepGoal(q, 1)).toBe("");
    expect(stepGoal(q, 1, [["8642"]])).toBe("Dùng 8642 để tìm x");
  });
  it("stepsGreeting neu viec cua buoc 1", () => {
    expect(stepsGreeting({ ...p, step_goals: ["Tìm 2x", "Tìm x"], step_hints: [["a"], ["b"]] })).toContain("Bước 1/2: Tìm 2x");
    expect(stepsGreeting(p)).toBe(STEPS_GREETING);
  });
});

describe("steps: may kiem va lich su", () => {
  const p = { ...parseProblems(SEED).ok.find((x) => x.id === "TC02")!, statement: "Mua 3 cái giá 20", data: { n: 3 } };
  it("chi bao KHONG khop khi hoc sinh co nêu so moi", () => {
    expect(machineCheck(p, "mình tính 60")).toBe("[Máy kiểm: KHÔNG khớp]");
    expect(machineCheck(p, "ok")).toBe("[Máy kiểm: bạn chưa nêu kết quả]");
    expect(machineCheck(p, "có 3 cái")).toBe("[Máy kiểm: bạn chưa nêu kết quả]"); // chi nhac lai so cua de
  });
  it("recent lay 4 tin cuoi, cat dai", () => {
    expect(recent([])).toBe("");
    const m = Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? "bot" as const : "student" as const, content: "x".repeat(300) + i, hint_level: null }));
    const r = recent(m);
    expect(r.split("\n").length).toBe(6); // "", tiêu đề, 4 tin
    expect(r).toContain("Bot: ");
    expect(r).not.toContain("x".repeat(201));
  });
});

describe("trac nghiem tung buoc", () => {
  const ch = { right: "x = 4", traps: [{ text: "x = -4", why: "Quen doi dau." }, { text: "x = 8", why: "Chia sai." }, { text: "x = 2", why: "Nham cong thuc." }] };
  const cp = { id: 0, label: "x = 4", anchors: ["4"], must: ["4"] };
  it("modeFor: quiz thieu trac nghiem lui ve steps, thieu loi giai lui ve chat", () => {
    expect(modeFor("quiz", { solution_steps: ["a"], step_choices: [ch] })).toBe("quiz");
    expect(modeFor("quiz", { solution_steps: ["a"], step_choices: [] })).toBe("steps");
    expect(modeFor("quiz", { solution_steps: [], step_choices: [] })).toBe("chat");
  });
  it("validChoice: 4 dap an khac nhau, right khong lac buoc", () => {
    expect(validChoice(ch, cp)).toBe(true);
    expect(validChoice({ ...ch, traps: [{ text: "x=4", why: "abc" }, ch.traps[1], ch.traps[2]] }, cp)).toBe(false); // trung right sau chuan hoa
    expect(validChoice({ ...ch, right: "x = 5" }, cp)).toBe(false); // right thieu so dap an
  });
  it("choiceOptions: xao on dinh theo seed, du 4 dap an", () => {
    const p = { step_choices: [ch] };
    const a = choiceOptions(p, 0, "sess-1");
    expect(a).toEqual(choiceOptions(p, 0, "sess-1"));
    expect([...a].sort()).toEqual(["x = -4", "x = 2", "x = 4", "x = 8"]);
    expect(choiceOptions(p, 5, "s")).toEqual([]);
  });
  it("hasChoices khop so buoc", () => {
    expect(hasChoices({ solution_steps: ["a"], step_choices: [ch] })).toBe(true);
    expect(hasChoices({ solution_steps: ["a", "b"], step_choices: [ch] })).toBe(false);
  });
});
