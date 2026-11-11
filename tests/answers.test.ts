import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/llm", () => ({ askText: vi.fn() }));

import { answersToLines, linesToAnswers, dropRedundantSummary, groupAnswers, answersInline } from "../lib/answers";
import { parseSolved } from "../lib/solve";
import { tidyLine } from "../lib/repair";

describe("đáp án: đối tượng ↔ dòng chữ", () => {
  it("đi và về không mất dữ liệu", () => {
    const o = { x: 2, y: 1, m: -6 };
    expect(answersToLines(o)).toBe("x = 2\ny = 1\nm = -6");
    const back = linesToAnswers(answersToLines(o));
    expect(back).toEqual({ ok: true, value: o });
  });
  it("phân số thành số thập phân; giá trị chữ có dấu = giữ nguyên (tách ở dấu = đầu tiên)", () => {
    const r = linesToAnswers("m = 14/3\nket_luan = m = 14/3 hoặc m khác 2");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.m).toBeCloseTo(4.666667, 5);
      expect(r.value.ket_luan).toBe("m = 14/3 hoặc m khác 2");
    }
  });
  it("trống thì {}; dán JSON kiểu cũ vẫn nhận", () => {
    expect(linesToAnswers("  \n ")).toEqual({ ok: true, value: {} });
    expect(linesToAnswers('{"x": 3, "y": -1}')).toEqual({ ok: true, value: { x: 3, y: -1 } });
  });
  it("báo lỗi rõ theo số dòng: thiếu =, tên sai, tên trùng, thiếu giá trị", () => {
    const err = (t: string) => { const r = linesToAnswers(t); return r.ok ? "" : r.error; };
    expect(err("x = 2\ny 5")).toMatch(/Dòng 2 thiếu dấu =/);
    expect(err("2x = 3")).toMatch(/Dòng 1.*chưa hợp lệ/);
    expect(err("x = 2\n\nx = 3")).toMatch(/Dòng 3.*trùng/);
    expect(err("x =")).toMatch(/Dòng 1.*thiếu giá trị/);
  });
});

describe("ket_luan dư và nhóm theo ý", () => {
  it("ket_luan chỉ nhắc lại các số đã có thì bỏ; đáp án chữ thật hoặc số mới thì giữ", () => {
    expect(dropRedundantSummary({ x: 2, y: 1, m: -6, ket_luan: "x = 2, y = 1 khi m = 1; m = -6" })).toEqual({ x: 2, y: 1, m: -6 });
    expect(dropRedundantSummary({ ket_luan: "vô nghiệm" })).toEqual({ ket_luan: "vô nghiệm" });
    expect(dropRedundantSummary({ m: -6, ket_luan: "m = -7" })).toEqual({ m: -6, ket_luan: "m = -7" });
  });
  it("gom theo ý a, b; khóa không tiền tố ở nhóm cuối; dòng gọn", () => {
    const o = { b_m: -6, a_x: 2, a_y: 1, k: 5, ket_luan: "2 và 1 và -6" };
    const g = groupAnswers(o);
    expect(g.map((x) => x.part)).toEqual(["a", "b", ""]);
    expect(g[0].items).toEqual([{ key: "x", value: 2 }, { key: "y", value: 1 }]);
    expect(answersInline(o)).toBe("a) x = 2, y = 1; b) m = -6; k = 5");
  });
});

describe("bước giải: tên theo ý và ket_luan dư", () => {
  it("parseSolved giữ a_x, a_y, b_m và bỏ ket_luan nhắc lại", () => {
    const raw = "<loi_giai>\nBước.\n</loi_giai>\n<dap_an>\na_x = 2\na_y = 1\nb_m = -6\nket_luan = x = 2, y = 1 khi m = 1; m = -6\n</dap_an>";
    expect(parseSolved(raw)!.answers).toEqual({ a_x: 2, a_y: 1, b_m: -6 });
  });
});

describe("dấu chấm cuối bước", () => {
  it("công thức cuối dòng đã kết thúc bằng dấu câu thì không thêm dấu chấm", () => {
    expect(tidyLine("Vậy hệ có nghiệm duy nhất là $(x; y) = (2; 1).$")).toBe("Vậy hệ có nghiệm duy nhất là $(x; y) = (2; 1).$");
    expect(tidyLine("Chuyển vế ta được $2x = 8$")).toBe("Chuyển vế ta được $2x = 8$.");
  });
});
