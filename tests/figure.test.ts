import { describe, expect, it } from "vitest";
import { parseBox, parseFigureTags, problemText } from "../lib/figure";
import { parseTagged } from "../lib/read-image";
import { problemSchema } from "../lib/schema/problem";

describe("problemText", () => {
  it("không có hình thì giữ nguyên đề", () => {
    expect(problemText({ statement: "Tính $x$." })).toBe("Tính $x$.");
    expect(problemText({ statement: "Tính $x$.", figure: { desc: "  " } })).toBe("Tính $x$.");
  });
  it("có mô tả thì thêm một dòng mô tả hình", () => {
    expect(problemText({ statement: "Tính BC.", figure: { desc: "Tam giác ABC vuông tại A, AB = 3, AC = 4." } })).toBe("Tính BC.\n[Hình vẽ kèm theo đề: Tam giác ABC vuông tại A, AB = 3, AC = 4.]");
  });
});

describe("parseBox", () => {
  it("đọc bốn số, kẹp vào 0..1000", () => {
    expect(parseBox("120, 300, 560, 980")).toEqual([120, 300, 560, 980]);
    expect(parseBox("-5,0,1200,1000")).toEqual([0, 0, 1000, 1000]);
  });
  it("sai hoặc quá nhỏ thì null để giáo viên tự khoanh", () => {
    expect(parseBox("")).toBeNull();
    expect(parseBox("10,20,30")).toBeNull();
    expect(parseBox("100,100,110,110")).toBeNull();
    expect(parseBox("500,500,100,100")).toBeNull();
  });
});

describe("thẻ hình trong kết quả đọc ảnh", () => {
  const raw = "<de>Cho tam giác ABC. Tính BC.</de>\n<dapan>BC = 5</dapan>\n<cachgiai>Áp dụng Pytago\nBC = 5</cachgiai>\n<hinh>Tam giác ABC vuông tại A, AB = 3, AC = 4.</hinh>\n<khung>100,200,600,900</khung>";
  it("tách mô tả và khung", () => {
    expect(parseFigureTags(raw)).toEqual({ desc: "Tam giác ABC vuông tại A, AB = 3, AC = 4.", box: [100, 200, 600, 900] });
  });
  it("ảnh không có hình: thẻ rỗng", () => {
    expect(parseFigureTags("<de>Giải $x=1$</de><hinh></hinh><khung></khung>")).toEqual({ desc: "", box: null });
    expect(parseFigureTags("<de>Giải $x=1$</de>")).toEqual({ desc: "", box: null });
  });
  it("cách giải không nuốt thẻ hình đứng sau", () => {
    expect(parseTagged(raw)?.cachgiai).toBe("Áp dụng Pytago\nBC = 5");
    const noClose = parseTagged("<de>Đề</de>\n<cachgiai>Bước một\n<hinh>Hình tròn tâm O</hinh>");
    expect(noClose?.cachgiai).toBe("Bước một");
  });
});

describe("figure trong đề", () => {
  const base = { id: "H1", title: "t", statement: "Tính BC.", solution: { BC: 5 }, hints: [1, 2, 3].map((level) => ({ level, text: "g" })) };
  it("đề cũ không có figure vẫn hợp lệ", () => {
    const r = problemSchema.safeParse(base);
    expect(r.success && r.data.figure).toBeUndefined();
  });
  it("giữ figure đúng dạng, mô tả mặc định rỗng", () => {
    const r = problemSchema.safeParse({ ...base, figure: { path: "abc/x.jpg" } });
    expect(r.success && r.data.figure).toEqual({ path: "abc/x.jpg", desc: "" });
  });
  it("figure sai dạng thì bỏ, không làm hỏng đề", () => {
    const r = problemSchema.safeParse({ ...base, figure: "linh tinh" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.figure).toBeUndefined();
  });
});
