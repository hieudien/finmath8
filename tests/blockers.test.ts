import { describe, expect, it } from "vitest";
import { problemSchema, type Problem } from "../lib/schema/problem";
import { blockers } from "../lib/lint";
import { cannotLock, missingInfo } from "../lib/ready";

const stmt = "điền vào chỗ trống.\nNếu một tam giác có ........ bằng tổng các bình phương độ dài hai cạnh kia thì tam giác đó là tam giác vuông";
const mk = (over: Partial<Problem> = {}): Problem => problemSchema.parse({
  id: "CBBM03", title: "pythago đảo", statement: stmt, solution: { ket_luan: "bình phương cạnh lớn nhất" },
  solution_steps: ["Cụm từ cần điền là bình phương độ dài cạnh lớn nhất."],
  hints: [1, 2, 3].map((level) => ({ level, text: "g" })), ...over,
});

describe("blockers (lỗi nặng chặn duyệt)", () => {
  it("đề đúng: không lỗi", () => expect(blockers(mk())).toEqual([]));
  it("đề CBBM03 cũ: đáp án trùng phần đề cho, chữ lỗi mã hóa", () => {
    const old = mk({
      solution: { ket_luan: "Tam giác vuông" },
      solution_steps: ["a) Äng thŰơc Äươc nêu là định lý Pytago đảo.", "Vậy kết luận là bình phương một cạnh."],
    });
    const w = blockers(old).join(" | ");
    expect(w).toMatch(/lỗi mã hóa/);
    expect(w).toMatch(/đã có sẵn trong đề/);
  });
  it("không báo nhầm số, chữ một từ, hay đáp án không nằm trong đề", () => {
    expect(blockers(mk({ solution: { x: 2 } }))).toEqual([]);
    expect(blockers(mk({ solution: { a: "Đúng" } }))).toEqual([]);
  });
  it("lỗi nặng chặn xác nhận đáp án và báo thiếu để tạo liên kết", () => {
    const bad = mk({ solution: { k: "tam giác vuông" } });
    expect(cannotLock(bad)).toMatch(/lỗi nặng/);
    expect(missingInfo(bad).join(" ")).toMatch(/lỗi nặng/);
    expect(cannotLock(mk())).toBe("");
  });
});
