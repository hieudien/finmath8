import { describe, expect, it } from "vitest";
import { problemSchema, type Problem } from "../lib/schema/problem";
import { lintProblem } from "../lib/lint";

const base = (over: Partial<Problem> = {}): Problem => problemSchema.parse({
  id: "T1", title: "Tiền", statement: "An có 300000 đồng, mua vở giá 10000 đồng mỗi quyển, giảm 15%.", data: { budget: 300000, discount: 0.15 },
  solution: { cost: 255000 }, solution_steps: ["Tiền giảm là 300000 x 0,15 = 45000.", "Phải trả 300000 - 45000 = 255000."],
  hints: [1, 2, 3].map((level) => ({ level, text: "gợi ý " + level })), ...over,
});

describe("lintProblem", () => {
  it("đề tốt: không cảnh báo", () => {
    const p = base({ solution: { saved: 45000, cost: 255000 }, step_goals: ["Tính tiền được giảm", "Tính số tiền phải trả"], step_hints: [["a", "b", "c"], ["a", "b", "c"]], });
    expect(lintProblem(p)).toEqual([]);
  });
  it("mục tiêu và gợi ý lộ kết quả", () => {
    const p = base({ step_goals: ["Tính tiền giảm, ra 45000", "Tính số tiền phải trả"], step_hints: [["a", "b", "c"], ["a", "b", "Ra 255000 nhé"]] });
    const t = lintProblem(p).join("|");
    expect(t).toContain("Mục tiêu bước 1");
    expect(t).toContain("Gợi ý riêng của bước 2");
  });
  it("chỉ dẫn lệch số bước", () => {
    expect(lintProblem(base({ step_goals: ["chỉ một"], step_hints: [["a"]] })).join("|")).toContain("lệch số bước");
  });
  it("đáp án chữ mà chưa có step_checks thì cảnh báo", () => {
    expect(lintProblem(base({ solution: { cost: 255000, best: "B" } })).join("|")).toContain("phần chữ");
    expect(lintProblem(base({ solution: { cost: 255000, best: "B" }, step_checks: [{ result: "45000", accepts: [] }, { result: "255000", accepts: [] }] })).join("|")).not.toContain("phần chữ");
  });
});

import { missingNums } from "../lib/verify-solution";
describe("missingNums (kiểm chéo)", () => {
  it("khớp, chênh lệch và thiếu", () => {
    expect(missingNums([275000, 270000], [275000, 270000])).toEqual([]);
    expect(missingNums([5000], [275000, 270000])).toEqual([]); // hiệu của hai số trong lời giải
    expect(missingNums([275000.5], [275000])).toEqual([]); // sai số 0,5%
    expect(missingNums([275000, 999], [275000, 270000])).toEqual([999]);
  });
});
