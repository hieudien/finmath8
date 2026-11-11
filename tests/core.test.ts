import { readFileSync } from "node:fs";
import { lintProblem } from "../lib/lint";
import { describe, expect, it } from "vitest";
import { scrub } from "../lib/pii";
import { decrypt, encrypt } from "../lib/crypto";
import { leaks } from "../lib/chat/prompt";
import { parseProblems } from "../lib/schema/problem";
import { friendly, kindOf } from "../lib/errors";
import { describe as describe_, ERR_KIND } from "../lib/log-labels";
import { plain } from "../lib/plain";
import { missingInfo, needsWork, readiness } from "../lib/ready";
import { ladder, revealLine, scoreCap, STALL_LIMIT } from "../lib/chat/assist";
import { ASK_METHOD, ASK_NEXT, keepOrAsk, earlyClose, checkpoints, countDone, hasEq, hasNum, markByNumbers, needsEq, offStreak, OFF_REPLIES, shapeOk, sim, stepOf, tighten, verdict, verify } from "../lib/chat/progress";
import { SEED } from "../lib/seed";
import { hardSteps, weakSteps } from "../lib/stats";
import { leaksCalc } from "../lib/chat/prompt";
import { cannedStuck, looksLikeStep, misses, NOT_JUDGE, offReply, PRAISE } from "../lib/chat/steps";
import { ASK_ANSWER, ASK_IS_STEP, ASK_LEAK, ASK_LIMIT, ASK_NOT_JUDGE, CLOSINGS, CLOSINGS_HELP, isOff, OFF_AGAIN, OFF_FIRST, pick, REPEAT, RETRY, STEP_LEAK, STUCK_HINT, STUCK_NOHINT } from "../lib/chat/canned";
import { hasGuides, stepCue, stepGoal, stepLead, stepsGreeting } from "../lib/chat/goals";
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
  it("buoc ra phuong trinh: bat buoc co dau =, khong nhan loi noi hay hai tong roi nhau", () => {
    const cps = checkpoints({ ...p, solution_steps: ["Bước 1: Hệ số của $y$ đối nhau.", "Bước 2: Cộng vế ta được $(3x+2x)+(2y-2y)=6+14$."] });
    expect(needsEq(cps[0])).toBe(false);
    expect(needsEq(cps[1])).toBe(true);
    expect(shapeOk(cps[0], "đối nhau")).toBe(true); // bước nhận xét: chữ thuần vẫn được
    expect(shapeOk(cps[1], "(3x+2y)+(2x-2y)=6+14")).toBe(true);
    expect(shapeOk(cps[1], "(3x+2y) + (2x - 2y) và 6 + 14")).toBe(false); // thiếu "="
    expect(shapeOk(cps[1], "cộng hai vế lại với nhau")).toBe(false);
    expect(shapeOk(cps[1], "= cộng hai vế")).toBe(false); // có "=" nhưng không có số
    expect(hasEq("5x ＝ 20")).toBe(true);
  });
});

describe("thang goi y: hien loi giai khi ket", () => {
  const cp = (id: number) => ({ id, label: `Bước ${id + 1}: làm việc ${id}`, anchors: [], must: [] });
  it("ladder chi dem khi het goi y, qua moc thi reset, du luot thi hien", () => {
    expect(ladder("steps", 1, 0, false)).toEqual({ stall: 0, reveal: false }); // chua het goi y: khong dem
    expect(ladder("steps", 3, 0, false)).toEqual({ stall: 1, reveal: false });
    expect(ladder("steps", 3, STALL_LIMIT - 1, false)).toEqual({ stall: STALL_LIMIT, reveal: true });
    expect(ladder("steps", 3, 4, true)).toEqual({ stall: 0, reveal: false });
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

describe("readiness", () => {
  const base = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  const full = { ...base, solution: { x: 4 }, solution_steps: ["a", "b"], step_goals: ["a", "b"], step_hints: [["h"], ["h"]], step_checks: [{ result: "", accepts: [] }, { result: "", accepts: [] }], reviewed: true };
  it("dem tung nhom", () => {
    expect(readiness(full)).toMatchObject({ ok: true, needGuides: false, pending: false, lint: [] });
    expect(readiness({ ...full, step_goals: [] })).toMatchObject({ ok: false, needGuides: true });
    expect(readiness({ ...full, step_checks: [] })).toMatchObject({ ok: false, needGuides: true }); // đề cũ chưa có kết quả chuẩn từng bước
    expect(readiness({ ...full, reviewed: false })).toMatchObject({ ok: false, pending: true });
    expect(readiness({ ...full, check_note: "lệch" })).toMatchObject({ ok: false }); // có cảnh báo thì không được tính đạt chuẩn
    expect(needsWork({ ...full, check_note: "lệch" })).toBe(true);
    expect(needsWork(full)).toBe(false);
    expect(needsWork({ nonsense: 1 })).toBe(false);
    expect(readiness({ nonsense: 1 })).toMatchObject({ bad: true, ok: false });
  });
});

describe("kieu tuong tac", () => {
  const p = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  it("markByNumbers: dung thu tu, nhay coc khong ghi nhan, gop buoc", () => {
    const cp = (id: number, must: string[]) => ({ id, label: "", anchors: must, must });
    const cps = [cp(0, ["8"]), cp(1, ["4"]), cp(2, [])];
    expect(markByNumbers("chưa biết", cps, 0)).toBe(0);
    expect(markByNumbers("2x = 8", cps, 0)).toBe(0b001); // buoc 1 xong
    expect(markByNumbers("x = 4", cps, 0)).toBe(0); // nhay coc: buoc 1 chua xong thi khong ghi nhan buoc 2
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
  it("leaksCalc: bat phep tinh ra thang ket qua bi mat, khong bat so cua de", () => {
    const q = { ...p, statement: "Cho 6 và 14", data: {}, solution: { x: 4 }, solution_steps: ["Cộng được 20", "Vậy x = 4"] };
    const sec = (r: string) => leaksCalc(r, q.solution, [q.data, q.statement], q.solution_steps);
    expect(sec("Bạn hãy cộng lại vế phải 6+14 nhé")).toBe(true);
    expect(sec("Tính $6 + 14$ nhé")).toBe(true);
    expect(sec("Hãy lấy 20 / 5")).toBe(true);
    expect(sec("Cộng hai vế phải với nhau")).toBe(false);
    expect(sec("Cộng 3x + 2x")).toBe(false);
    expect(sec("Ví dụ 2 + 3 = 5")).toBe(false);
  });
  it("looksLikeStep: tin hoi that khong bi chan, buoc giai bi bat", () => {
    const q = { ...p, statement: "Giải 3x + 2y = 6", data: {} };
    expect(looksLikeStep(q, "Hệ số của y là gì vậy?")).toBe(false);
    expect(looksLikeStep(q, "em không hiểu hệ số")).toBe(false);
    expect(looksLikeStep(q, "5x = 20")).toBe(true);
    expect(looksLikeStep(q, "Hệ số của y là 2 và -2, hai số đối nhau")).toBe(true);
    expect(NOT_JUDGE.test("Đúng rồi bạn! cộng vế")).toBe(true);
  });
  it("misses: dem tin nop tu lan bot nen Buoc k/n gan nhat, bo qua cau hoi", () => {
    const m = (role: "bot" | "student", content: string) => ({ role, content, hint_level: 0 });
    const all = [m("bot", "Bước 1/5: a"), m("student", "x"), m("bot", "sai"), m("bot", "Bước 2/5: b"), m("student", "y"), m("student", "[Hỏi] gì"), m("bot", "ok"), m("student", "z")];
    expect(misses(all, 2, 5)).toBe(2);
    expect(misses(all, 1, 5)).toBe(3);
    expect(misses([], 1, 5)).toBe(0);
  });
  it("cannedStuck: khong biet / doi dap an / lap tin thi tra cau cung, tin lam bai thi de AI", () => {
    const q = { ...p, step_goals: ["Tìm 2x", "Tìm x"], step_hints: [["a"], ["b"]] };
    const cps = checkpoints(q);
    const c = (t: string, prior: string[] = [], hl = 0) => cannedStuck({ hint_level: hl }, q, cps, 0, t, prior);
    const has = (out: string, arr: readonly string[]) => arr.some((x) => out.includes(x));
    expect(has(c("không biết"), STUCK_HINT)).toBe(true);
    expect(c("không biết")).toContain("Việc cần làm ở bước 1/2: Tìm 2x");
    expect(has(c("cho em đáp án"), ASK_ANSWER)).toBe(true);
    expect(has(c("bó tay", [], 3), STUCK_NOHINT)).toBe(true);
    expect(has(c("2x = 5", ["2x = 5", "2x = 5"]), REPEAT)).toBe(true);
    for (let i = 0; i < 20; i++) expect((c("không biết", [], 0).match(/Việc cần làm ở bước/g) ?? []).length).toBe(1); // cue chỉ một lần
    expect(c("2x = 5", ["2x = 5", "[Hỏi] gì", "2x = 6"])).toBe("");
    expect(c("Tính 2x bằng cách chia")).toBe("");
  });
  it("offReply: nem cu the buoc, lan 2 doi cau", () => {
    const q = { ...p, step_goals: ["Tìm 2x", "Tìm x"], step_hints: [["a"], ["b"]] };
    const cps = checkpoints(q);
    const r1 = offReply(q, cps, 0, []);
    expect(r1).toContain("Bước 1/2: Tìm 2x");
    const r2 = offReply(q, cps, 0, [{ role: "bot", content: r1, hint_level: 0 }]);
    expect(OFF_AGAIN.some((x) => r2.startsWith(x))).toBe(true);
    expect(r2).toContain("Bước 1/2: Tìm 2x");
    expect(r2).not.toBe(r1);
    const r3 = offReply(q, cps, 0, [{ role: "bot", content: r1, hint_level: 0 }, { role: "bot", content: r2, hint_level: 0 }]);
    expect(OFF_AGAIN.some((x) => r3.startsWith(x))).toBe(true); // lạc đề liên tiếp vẫn nhận ra, không quay về câu lần 1
  });
  it("canned: moi nhom 5 bien the khac nhau, pick tranh lap tin truoc", () => {
    for (const a of [STUCK_HINT, STUCK_NOHINT, ASK_ANSWER, REPEAT, OFF_FIRST, OFF_AGAIN, ASK_LIMIT, ASK_IS_STEP, ASK_NOT_JUDGE, ASK_LEAK, STEP_LEAK, RETRY, CLOSINGS, CLOSINGS_HELP]) expect(new Set(a).size).toBe(5);
    for (let i = 0; i < 30; i++) expect(pick(RETRY, RETRY[2])).not.toBe(RETRY[2]);
    expect(pick(["a"], "a")).toBe("a"); // chỉ còn một biến thể thì vẫn dùng được
    expect(isOff(OFF_FIRST[3])).toBe(true);
    expect(isOff("Bước 1/5: a")).toBe(false);
  });
  it("stepsGreeting neu viec cua buoc 1", () => {
    expect(stepsGreeting({ ...p, step_goals: ["Tìm 2x", "Tìm x"], step_hints: [["a"], ["b"]] })).toContain("Bước 1/2: Tìm 2x");
    expect(stepsGreeting(p)).toBe("Bạn viết từng bước giải vào ô bên dưới, mỗi lần một bước. Mình sẽ kiểm tra từng bước. Cần gợi ý thì bấm nút Gợi ý nhé. Bước 1/2: Tính 2x = …");
  });
  it("stepCue luon co noi dung: thieu muc tieu thi lay loi giai da che so", () => {
    expect(stepCue(p, 0)).toBe("Tính 2x = …");
    expect(stepCue({ ...p, solution_steps: [] }, 0)).toBe("");
    expect(stepCue({ ...p, step_goals: ["Tìm 2x", "Tìm x"], step_hints: [["a"], ["b"]] }, 0)).toBe("Tìm 2x");
  });
  it("stepLead: goi y muc 1 khac muc tieu, chan lo dap an", () => {
    expect(stepLead({ ...p, step_goals: ["Tìm 2x", "Tìm x"], step_hints: [["Nhìn vế trái"], ["x = 4321"]] }, 0)).toBe("Nhìn vế trái");
    expect(stepLead({ ...p, step_goals: ["Tìm 2x", "Tìm x"], step_hints: [["Nhìn vế trái"], ["x = 4321"]] }, 1)).toBe("");
    expect(stepLead(p, 0)).toBe("");
  });
  it("hardSteps dem hoc sinh theo buoc, nhieu nhat truoc", () => {
    const probs = new Map([["A", { title: "t", steps: ["Bước 1: a", "Bước 2: b"], goals: [] as string[] }]]);
    const r = hardSteps([{ id: "1", problem_code: "A", student_code: "h1", struggled: 0b10 }, { id: "2", problem_code: "A", student_code: "h1", struggled: 0b10 }, { id: "3", problem_code: "A", student_code: "h2", struggled: 0b11 }], probs);
    expect(r.map((x) => [x.step, x.n, x.label])).toEqual([[2, 2, "b"], [1, 1, "a"]]);
    expect(r[0].students.map((w) => [w.code, w.times])).toEqual([["h1", 2], ["h2", 1]]);
  });
  it("weakSteps: mot hoc sinh, buoc giai ho len truoc", () => {
    const probs = new Map([["A", { title: "t", steps: ["a", "b", "c"], goals: [] as string[] }]]);
    const r = weakSteps([{ id: "1", problem_code: "A", student_code: "h", struggled: 0b011, revealed: 0b010 }, { id: "2", problem_code: "A", student_code: "h", struggled: 0b001 }], probs);
    expect(r.map((x) => [x.step, x.struggled, x.revealed, x.of])).toEqual([[2, 1, 1, 2], [1, 2, 0, 2]]);
    expect(r[0].sessions.map((x) => [x.id, x.helped])).toEqual([["1", true]]);
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

describe("nhat ky loi va hoat dong", () => {
  it("kindOf phan loai loi AI va he thong", () => {
    expect(kindOf("429 RESOURCE_EXHAUSTED quota")).toBe("quota");
    expect(kindOf("AI_TIMEOUT: x")).toBe("timeout");
    expect(kindOf("API key not valid")).toBe("key");
    expect(kindOf("503 UNAVAILABLE")).toBe("overload");
    expect(kindOf("Mô hình AI trả dữ liệu sai định dạng: x")).toBe("format");
    expect(kindOf(new Error("Lỗi cơ sở dữ liệu: boom"))).toBe("db");
    expect(kindOf("gi do la")).toBe("other");
  });
  it("moi loai loi co nhan hien thi", () => {
    for (const k of ["quota", "timeout", "key", "model", "overload", "format", "db", "config", "mail", "render", "client", "other"]) expect(ERR_KIND[k]?.label).toBeTruthy();
  });
  it("mo ta hoat dong moi", () => {
    expect(describe_("rate_limited", { rule: "too_fast" })).toMatch(/2 giây/);
    expect(describe_("link_closed", { reason: "expired" })).toMatch(/hết hạn/);
    expect(describe_("settings_changed", { provider: "openai", changed: { provider: { from: "gemini", to: "openai" } } })).toMatch(/Google Gemini sang OpenAI/);
  });
});

describe("sua chat luong tung buoc", () => {
  const tc05 = parseProblems(JSON.parse(readFileSync("de-mau-10.json", "utf8"))).ok.find((x) => x.id === "TC05")!;
  it("loi khen khi buoc chua qua bi nhan ra; 'chua dung' va 'dung huong' thi khong", () => {
    for (const t of ["Bạn đã tính đúng số tiền là $320.000$ đồng.", "Bạn tính rất chính xác.", "Giỏi lắm!", "Tuyệt vời, đúng rồi!"]) expect(PRAISE.test(t)).toBe(true);
    for (const t of ["Mình thấy chưa đúng, bạn kiểm tra lại.", "Kết quả chưa chính xác.", "Bạn đang đúng hướng, còn thiếu một vế.", "Không đúng phép tính nào."]) expect(PRAISE.test(t)).toBe(false);
  });
  it("buoc ket qua trung gian co must tu dau = cuoi", () => {
    const cps = checkpoints(tc05);
    expect(cps[1].must).toEqual(["53000000"]);
    expect(cps[2].must).toEqual(["56180000"]);
    expect(markByNumbers("50.000.000 × 1,06 = 53.000.000", cps, 1) & 2).toBe(2);
    expect(markByNumbers("mình tính ra 54.000.000", cps, 1) & 2).toBe(0);
  });
  it("he so nho chi la toan hang khong bi coi la lo dap an; ket qua van bi chan", () => {
    const g = [tc05.data, tc05.statement];
    expect(leaks("Hãy nhân số tiền gốc với $1,06$.", tc05.solution, g, tc05.solution_steps)).toBe(false);
    expect(leaks("Năm 1 bạn được 53.000.000 đồng.", tc05.solution, g, tc05.solution_steps)).toBe(true);
    expect(leaks("Tổng là 56.180.000 đồng.", tc05.solution, g, tc05.solution_steps)).toBe(true);
  });
});

describe("lint: ky tu hong va buoc bi cat vun", () => {
  const base = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  it("bao ky tu dieu khien va buoc khong mo dau bang Buoc N", () => {
    const tab = String.fromCharCode(9);
    const bad = { ...base, statement: `Tính ${tab}imes 2`, solution_steps: ["Bước 1: Điều kiện $D", "eq 0$.", "Bước 2: Kết luận."] };
    const w = lintProblem(bad).join(" | ");
    expect(w).toMatch(/ký tự điều khiển/);
    expect(w).toMatch(/Bước 2 không mở đầu/);
    expect(lintProblem({ ...base, solution_steps: ["Bước 1: a = 1.", "Bước 2: b = 2."] }).join(" ")).not.toMatch(/ký tự điều khiển|không mở đầu/);
  });
});
