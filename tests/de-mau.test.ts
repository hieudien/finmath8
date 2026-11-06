import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseProblems } from "../lib/schema/problem";

const list = JSON.parse(readFileSync("de-mau-10.json", "utf8"));
const s = (id: string) => list.find((p: { id: string }) => p.id === id).solution;

it("10 đề hợp lệ schema", () => {
  const r = parseProblems(list);
  expect(r.errors).toEqual([]);
  expect(r.ok).toHaveLength(10);
});

it("đáp án tính lại khớp", () => {
  expect(s("TC01")).toMatchObject({ cost_A: 300000 * 0.85 + 20000, cost_B: 300000 * 0.9 });
  expect((480000 - 120000) / 40000).toBe(s("TC02").weeks);
  expect(400000 * 0.8).toBe(s("TC03").cost_KM1);
  expect(Math.round((400000 - 50000) * 0.9)).toBe(s("TC03").cost_KM2);
  expect(60000 + 4 * 10000).toBe(s("TC04").cost_A);
  expect(60000 + 10000 * (s("TC04").equal_at_gb - 5)).toBe(90000);
  expect(Math.round(50e6 * 1.06 ** 2)).toBe(s("TC05").compound_total);
  expect(Math.round(50e6 * (1 + 0.06 * 2))).toBe(s("TC05").simple_total);
  const loan = 3e6 * 0.8, interest = Math.round(loan * 0.01 * 6);
  expect([3e6 * 0.2, loan, interest, 3e6 * 0.2 + loan + interest, (loan + interest) / 6]).toEqual([600000, 2400000, 144000, 3144000, 424000].map((x) => x).slice(0, 5).map((x, i) => [s("TC06").down_payment, s("TC06").loan, s("TC06").interest, s("TC06").total, s("TC06").monthly][i]));
  expect((350000 - 30000 - 3 * 70000) / 2).toBe(s("TC07").max_per_day);
  const sell = 100 * 27000, fee = Math.round(sell * 0.002), profit = sell - fee - 100 * 25000;
  expect([fee, profit, Math.round((profit / 2.5e6) * 10000) / 100, 2.5e6 * 0.005]).toEqual([s("TC08").fee, s("TC08").net_profit, s("TC08").return_percent, s("TC08").bank_interest]);
  expect(Math.round(500000 * 0.9 * 1.08)).toBe(s("TC09").cost_A);
  expect(500000 * 1.08 - 50000).toBe(s("TC09").cost_B);
  expect(240000 / (52000 - 40000)).toBe(s("TC10").students);
});

it("mọi đề có lời giải từng bước, bước cuối có kết luận", () => {
  for (const p of list as { id: string; solution_steps: string[] }[]) {
    expect(p.solution_steps.length, p.id).toBeGreaterThanOrEqual(3);
    expect(p.solution_steps.at(-1), p.id).toMatch(/Kết luận|Nhận xét|So với/);
  }
});

it("số lớn trong đáp án đều xuất hiện trong lời giải", () => {
  for (const p of list as { id: string; solution: Record<string, unknown>; solution_steps: string[] }[]) {
    const text = p.solution_steps.join(" ").replace(/(?<=\d)[.\s](?=\d{3}(?!\d))/g, "").replace(/(?<=\d),(?=\d)/g, ".");
    const nums = (JSON.stringify(p.solution).match(/\d+(\.\d+)?/g) ?? []).filter((n) => Number(n) >= 100);
    for (const n of nums) expect(text.includes(n), `${p.id}: thiếu ${n}`).toBe(true);
  }
});

import { fmtValue, labelOf, problemToText } from "../lib/problem-text";

it("mọi khóa trong data và solution có nhãn tiếng Việt", () => {
  const thieu = new Set<string>();
  for (const p of list as { data: object; solution: object }[]) for (const k of [...Object.keys(p.data), ...Object.keys(p.solution)]) if (labelOf(k) === k.replace(/_/g, " ")) thieu.add(k);
  expect([...thieu]).toEqual([]);
});

it("định dạng số và phần trăm", () => {
  expect(fmtValue("discount_A", 0.15)).toBe("15%");
  expect(fmtValue("cost_A", 275000)).toBe("275.000 đồng");
  expect(fmtValue("return_percent", 7.78)).toBe("7,78%");
  expect(fmtValue("monthly_rate", 0.01)).toBe("1%");
  expect(fmtValue("best", "B")).toBe("B");
});

it("văn bản đề có đủ các phần", () => {
  const t = problemToText((list as never[])[0]);
  for (const h of ["ĐỀ BÀI", "DỮ KIỆN", "LỜI GIẢI", "KẾT QUẢ", "GỢI Ý CHO HỌC SINH", "Bước 1.", "Phải trả ở B: 270.000 đồng", "Lựa chọn tốt nhất: B"]) expect(t).toContain(h);
});
