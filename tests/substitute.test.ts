import { describe, expect, it, vi } from "vitest";
import { problemSchema } from "../lib/schema/problem";

vi.mock("../lib/llm", () => ({ askJson: vi.fn() }));
import { substituteCheck, substituteState } from "../lib/verify-solution";

const mk = (statement: string, solution: Record<string, unknown>) => problemSchema.parse({ id: "T", title: "t", statement, solution, hints: [1, 2, 3].map((level) => ({ level, text: "g" })) });
const BS = String.fromCharCode(92);
const cases = (...rows: string[]) => `${BS}begin{cases} ${rows.join(` ${BS}${BS} `)} ${BS}end{cases}`;

describe("substituteCheck", () => {
  it("TC04: hệ có phân thức; nghiệm đúng qua, nghiệm sai bị bắt", () => {
    const st = cases("${BS}frac{4}{x+y} + ${BS}frac{1}{y-1} = 5", "${BS}frac{1}{x+y} - ${BS}frac{2}{y-1} = -1").replaceAll("${BS}", BS);
    expect(substituteCheck(mk(st, { x: -1, y: 2 }))).toBe("");
    expect(substituteCheck(mk(st, { x: 0, y: 2 }))).toContain("không thỏa");
  });
  it("đề gõ nhầm ba dấu gạch chéo giữa hai hàng vẫn kiểm được (TC04 trong DB)", () => {
    const st = `${BS}begin{cases} ${BS}frac{4}{x+y} + ${BS}frac{1}{y-1} = 5 ${BS}${BS}${BS} ${BS}frac{1}{x+y} - ${BS}frac{2}{y-1} = -1 ${BS}end{cases}`;
    expect(substituteCheck(mk(st, { x: -1, y: 2 }))).toBe("");
    expect(substituteCheck(mk(st, { x: 1, y: 2 }))).toContain("không thỏa");
  });
  it("TC03: x = 8, y = 2 đúng; 10, 4 sai", () => {
    const st = cases(`${BS}frac{x + y}{5} = ${BS}frac{x - y}{3}`, `${BS}frac{x}{4} = ${BS}frac{y}{2} + 1`);
    expect(substituteCheck(mk(st, { x: 8, y: 2 }))).toBe("");
    expect(substituteCheck(mk(st, { x: 10, y: 4 }))).toContain("không thỏa");
  });
  it("phương trình một ẩn trong $...$: pass, fail, và trạng thái skip", () => {
    const st = "Giải phương trình $2x + 3 = 11$.";
    expect(substituteState(mk(st, { x: 4 })).state).toBe("pass");
    expect(substituteState(mk(st, { x: 5 })).state).toBe("fail");
    expect(substituteState(mk("Giải $2x = 4$ và $y = 1$", { x: 2 })).state).toBe("skip"); // hai phương trình, một ẩn: không kết luận
    expect(substituteState(mk(st, {})).state).toBe("skip");
  });
  it("nhân ngầm 2x, mx; có tham số hoặc không phải hệ thì bỏ qua", () => {
    expect(substituteCheck(mk(cases("2x + 3y = 8", "x - y = 1"), { x: 2.2, y: 1.2 }))).toBe("");
    expect(substituteCheck(mk(cases("mx - y = 2m", "4x - my = m + 6"), { m: -2 }))).toBe("");
    expect(substituteCheck(mk("Giải 2x + 3 = 11", { x: 100 }))).toBe("");
  });
});

import { cannotLock } from "../lib/ready";
describe("cannotLock", () => {
  const base = { id: "T", title: "t", statement: "Giải $2x = 4$", hints: [1, 2, 3].map((level) => ({ level, text: "g" })) };
  it("chỉ đề có đáp án, chưa khóa, đúng định dạng mới xác nhận được", () => {
    expect(cannotLock({ ...base, solution: { x: 2 } })).toBe("");
    expect(cannotLock({ ...base, solution: { x: 2 }, answer_locked: true })).toBe("Đã khóa.");
    expect(cannotLock({ ...base, solution: {} })).toBe("Chưa có đáp án.");
    expect(cannotLock({ id: "T" })).toBe("Đề lưu sai định dạng.");
  });
});
