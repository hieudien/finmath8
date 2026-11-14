import { describe, expect, it } from "vitest";
import { facets, matchClass, NO_FILTER, type Cls } from "@/lib/problem-filter";
import { problemSchema } from "@/lib/schema/problem";
import { topicsFor, taxonomyRule } from "@/lib/taxonomy";

const items: Cls[] = [
  { grade: 8, branch: "algebra", topic: "Phân thức đại số" },
  { grade: 8, branch: "geometry", topic: "Tứ giác" },
  { grade: 9, branch: "geometry", topic: "Đường tròn" },
  { grade: 9, topic: "" },
];

describe("lọc đề theo lớp, nhánh, chủ đề", () => {
  it("không lọc thì giữ hết", () => expect(items.filter((c) => matchClass(c, NO_FILTER))).toHaveLength(4));
  it("lọc theo lớp và nhánh", () => {
    expect(items.filter((c) => matchClass(c, { ...NO_FILTER, grade: "9", branch: "geometry" }))).toHaveLength(1);
  });
  it("nhánh none = chưa phân loại", () => {
    expect(items.filter((c) => matchClass(c, { ...NO_FILTER, branch: "none" }))).toEqual([items[3]]);
  });
  it("lọc theo chủ đề", () => expect(items.filter((c) => matchClass(c, { ...NO_FILTER, topic: "Tứ giác" }))).toEqual([items[1]]));
  it("ô chủ đề chỉ liệt kê chủ đề trong phạm vi lớp và nhánh đã chọn", () => {
    expect(facets(items, { ...NO_FILTER, grade: "8" }).topics).toEqual(["Phân thức đại số", "Tứ giác"]);
    expect(facets(items, { ...NO_FILTER, branch: "geometry" }).topics).toEqual(["Tứ giác", "Đường tròn"].sort((a, b) => a.localeCompare(b, "vi")));
    expect(facets(items, NO_FILTER).grades).toEqual([8, 9]);
  });
});

describe("nhánh trong schema đề", () => {
  const base = { id: "A", title: "t", statement: "đề", solution: {}, hints: [1, 2, 3].map((level) => ({ level, text: "g" })) };
  it("đề cũ không có branch vẫn hợp lệ", () => {
    const r = problemSchema.safeParse(base);
    expect(r.success && r.data.branch).toBeFalsy();
  });
  it("branch hợp lệ được giữ, giá trị lạ của AI thành chưa phân loại", () => {
    expect(problemSchema.parse({ ...base, branch: "geometry" }).branch).toBe("geometry");
    expect(problemSchema.parse({ ...base, branch: "linh tinh" }).branch).toBeUndefined();
  });
});

describe("danh mục chủ đề", () => {
  it("có gợi ý cho lớp 6-9, lớp khác để trống", () => {
    expect(topicsFor(8, "geometry")).toContain("Tam giác đồng dạng");
    expect(topicsFor(12)).toEqual([]);
  });
  it("prompt nêu danh sách chủ đề của lớp", () => expect(taxonomyRule(9)).toContain("Đường tròn"));
});
