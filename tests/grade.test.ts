import { describe, expect, it } from "vitest";
import { problemSchema } from "@/lib/schema/problem";
import { aboveGrade, gradeRule } from "@/lib/grade";

const mk = (grade: number, step: string) => problemSchema.parse({
  id: "T1", title: "t", grade, statement: "Giải $2x=4$", solution: { x: 2 }, solution_steps: [step],
  hints: [1, 2, 3].map((level) => ({ level, text: "gợi ý" })),
});

describe("lớp của đề", () => {
  it("prompt nêu đúng lớp và cấm kiến thức vượt lớp", () => {
    const r = gradeRule(9);
    expect(r).toContain("lớp 9");
    expect(r).toContain("không dùng đạo hàm");
    expect(r).toContain("kiến thức lớp trên");
  });
  it("lint báo kiến thức vượt lớp ở lớp dưới 11, không báo từ lớp 11", () => {
    expect(aboveGrade(mk(9, "Lấy đạo hàm hai vế"))).toHaveLength(1);
    expect(aboveGrade(mk(9, "Chia hai vế cho 2 được $x=2$"))).toHaveLength(0);
    expect(aboveGrade(mk(12, "Tính tích phân"))).toHaveLength(0);
  });
});

describe("aboveGrade: từ khóa theo lớp", () => {
  const mk2 = (grade: number, step: string) => problemSchema.parse({ id: "T", title: "t", grade, statement: "s", solution: { x: 1 }, solution_steps: [step], hints: [1, 2, 3].map((level) => ({ level, text: "g" })) });
  it("lớp 8 chưa học phương trình bậc hai, lớp 9 thì học", () => {
    expect(aboveGrade(mk2(8, "Tính biệt thức delta của phương trình bậc hai"))).toHaveLength(1);
    expect(aboveGrade(mk2(9, "Tính biệt thức delta của phương trình bậc hai"))).toHaveLength(0);
  });
  it("lớp 9 chưa học logarit hay vectơ", () => {
    expect(aboveGrade(mk2(9, "Lấy logarit hai vế"))).toHaveLength(1);
    expect(aboveGrade(mk2(10, "Lấy logarit hai vế"))).toHaveLength(0);
  });
});
