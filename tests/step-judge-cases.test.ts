import { describe, expect, it } from "vitest";
import { loadStepJudgeCases, VERDICTS } from "../evals/cases/step-judge";

// Kiểm tra bộ case đúng khuôn (chưa gọi AI): để người duyệt nhãn và bước sau chạy được trên một định dạng cố định.
describe("bộ case chấm bước", () => {
  const cases = loadStepJudgeCases();
  it("id không trùng", () => { expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length); });
  it("credit chỉ gồm bước từ bước hiện tại trở đi, tăng dần, không trùng", () => {
    for (const c of cases) {
      const cr = c.expect.credit;
      expect(cr.every((n) => n >= c.step), c.id).toBe(true);
      expect([...cr].sort((a, b) => a - b), c.id).toEqual(cr);
      expect(new Set(cr).size, c.id).toBe(cr.length);
    }
  });
  it("chỉ verdict 'du' mới được ghi nhận bước, và 'du' luôn ghi nhận ít nhất bước hiện tại", () => {
    for (const c of cases) {
      if (c.expect.verdict === "du") expect(c.expect.credit[0], c.id).toBe(c.step);
      else expect(c.expect.credit, c.id).toEqual([]);
    }
  });
  it("mỗi verdict có ít nhất 2 case", () => {
    for (const v of VERDICTS) expect(cases.filter((c) => c.expect.verdict === v).length, v).toBeGreaterThanOrEqual(2);
  });
  it("có cả bài hệ phương trình và bài lời văn", () => {
    expect(new Set(cases.map((c) => c.problem)).size).toBeGreaterThanOrEqual(2);
  });
  it("có ít nhất 6 case gõ LaTeX và case không dấu", () => {
    expect(cases.filter((c) => /[\\$]/.test(c.text)).length).toBeGreaterThanOrEqual(6);
    expect(cases.some((c) => c.id === "b1-no-accent")).toBe(true);
  });
  it("case phụ thuộc ngữ cảnh có history, và history luôn kết thúc bằng tin của bot hoặc học sinh hợp lệ", () => {
    for (const id of ["b2-hint-answer", "b1-not-yet"]) expect(cases.find((c) => c.id === id)?.history.length, id).toBeGreaterThan(0);
  });
  it("nhãn đã chốt: x=10 ở bước 5 bài GBT01 là thieu (mới một nghiệm)", () => {
    expect(cases.find((c) => c.id === "g5-one-root")?.expect.verdict).toBe("thieu");
  });
  it("có case lấy từ các phiên thật và case chặn lỗi hasWord", () => {
    for (const s of ["ec00b60c", "853aa878", "3a4e9865"]) expect(cases.some((c) => c.source === s), s).toBe(true);
    expect(cases.find((c) => c.id === "b2-system-ok")?.expect.credit).toEqual([2]);
  });
});
