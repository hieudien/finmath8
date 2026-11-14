import { describe, expect, it, vi } from "vitest";
import { problemSchema, type Problem } from "../lib/schema/problem";
import { checkpoints, hasWord, markByNumbers, met } from "../lib/chat/progress";
import { leaks, leaksExpr } from "../lib/chat/prompt";

vi.mock("../lib/llm", () => ({ askJson: vi.fn() }));
vi.mock("../lib/errors", () => ({ reportError: vi.fn(async () => {}) }));
import { askJson } from "../lib/llm";


const base = (over: Partial<Problem> = {}): Problem => problemSchema.parse({
  id: "T1", title: "Tiền", statement: "An có 300000 đồng, giảm 15%.", data: { budget: 300000, discount: 0.15 },
  solution: { saved: 45000, cost: 255000 }, solution_steps: ["Tiền giảm là 300000 x 0,15 = 45000.", "Phải trả 300000 - 45000 = 255000."],
  hints: [1, 2, 3].map((level) => ({ level, text: "g" + level })), ...over,
});
const pe = (over: Partial<Problem> = {}) => base({ solution: { x: "x=2" }, solution_steps: ["Chuyển vế: 3x = 6.", "Chia hai vế cho 3 được x=2."], ...over });

describe("checkpoints với step_checks", () => {
  it("kết quả trung gian thành mốc server tự kiểm", () => {
    const p = base({ solution: { cost: 255000 } });
    expect(checkpoints(p)[0].must).toEqual(["45000"]); // 45000 không có trong đáp án nhưng đứng sau dấu = cuối của bước
    const q = base({ solution: { cost: 255000 }, step_checks: [{ result: "45000", accepts: ["45 nghìn"] }, { result: "255000", accepts: [] }] });
    expect(checkpoints(q)[0].must).toEqual(["45000"]);
    expect(markByNumbers("300000 x 0,15 = 45.000", checkpoints(q), 0)).toBe(1);
  });
  it("bộ số khác (accepts) cũng được", () => {
    const q = base({ step_checks: [{ result: "0.15", accepts: ["15%"] }, { result: "255000", accepts: [] }] });
    const c = checkpoints(q)[0];
    expect(met(c, "giảm 15%")).toBe(false); // 0.15 có trong đề nên không dùng làm số kiểm
    expect(c.must).toEqual(["45000"]); // rơi về cách cũ: số của lời giải cũng có trong đáp án
  });
  it("lệch số bước thì bỏ qua step_checks", () => {
    const q = base({ solution: { cost: 255000 }, step_checks: [{ result: "99999", accepts: [] }] });
    expect(checkpoints(q)[0].must).toEqual(["45000"]); // không dùng 99999 của step_checks, rơi về số sau dấu =
  });
  it("kết quả dạng chữ/biểu thức so chuỗi chính tắc", () => {
    const p = pe({ step_checks: [{ result: "3x=6", accepts: [] }, { result: "x=2", accepts: [] }] });
    const cps = checkpoints(p);
    expect(cps[1].words).toEqual(["x=2"]);
    expect(met(cps[1], "Vậy $x = 2$")).toBe(true);
    expect(met(cps[1], "x = 25")).toBe(false);
    expect(met(cps[0], "3x = 6")).toBe(true);
  });
});

describe("hasWord", () => {
  it("không dính vào số dài hơn", () => {
    expect(hasWord("x=25", "x=2")).toBe(false);
    expect(hasWord("x = 2.", "x=2")).toBe(true);
    expect(hasWord("12x=2", "2x=2")).toBe(false);
  });
});

describe("leaksExpr", () => {
  const p = pe();
  it("chặn đáp án biểu thức khi đề và học sinh chưa nêu", () => {
    expect(leaksExpr("Vậy $x = 2$ nhé", p.solution, [p.data, p.statement])).toBe(true);
    expect(leaks("Vậy x=2", p.solution, [p.data, p.statement], p.solution_steps)).toBe(true);
    expect(leaksExpr("Vậy x = 2", p.solution, [p.data, "mình ra x = 2"])).toBe(false);
    expect(leaksExpr("Bạn thử chia hai vế", p.solution, [])).toBe(false);
  });
  it("đáp án chữ thuần không chặn", () => {
    expect(leaksExpr("phương trình vô nghiệm", { kl: "vô nghiệm" }, [])).toBe(false);
  });
});

