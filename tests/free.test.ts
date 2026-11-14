import { describe, expect, it } from "vitest";
import { hasDerivation, offReply, reachedAnswer, wrongResult } from "../lib/chat/free";
import { leaksCalc } from "../lib/chat/prompt";
import { parseProblems } from "../lib/schema/problem";
import { SEED } from "../lib/seed";

// Chat nộp bài làm tự do: phần server quyết (không gọi AI) để biết học sinh đã nêu đáp án cuối và có cách làm chưa.
describe("reachedAnswer: đã nêu đáp án cuối", () => {
  const base = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  const p = { ...base, statement: "Cho AB = 3, AC = 4. Tính BC.", data: { AB: 3, AC: 4 }, solution: { BC: 5 }, solution_steps: ["Áp dụng Pythagore: $BC^2 = 3^2 + 4^2 = 25$", "Vậy $BC = 5$"] };
  it("chỉ tính số đáp án mà đề chưa cho", () => {
    expect(reachedAnswer(p, "3^2+4^2=x^2")).toBe(false); // 3 và 4 là số của đề, chưa có 5
    expect(reachedAnswer(p, "x = 5")).toBe(true);
    expect(reachedAnswer(p, "mình nghĩ x = 50")).toBe(false); // 50 không phải 5
  });
});

describe("hasDerivation: có phép biến đổi, không chỉ kết quả trơn", () => {
  it("kết quả trơn thì không", () => {
    expect(hasDerivation("x = 5")).toBe(false);
    expect(hasDerivation("5")).toBe(false);
  });
  it("phép tính, kể cả số mũ Unicode, thì có", () => {
    expect(hasDerivation("3²+4²=x²")).toBe(true);
    expect(hasDerivation("3^2+4^2=x^2")).toBe(true);
    expect(hasDerivation("x² = 25 nên x = 5")).toBe(true);
  });
  it("câu chuyện phiếm có từ nối nhưng không có dấu = thì không", () => {
    expect(hasDerivation("hôm nay ăn gì vậy")).toBe(false);
  });
});

describe("offReply", () => {
  it("lần 1 nhắc quay lại bài", () => {
    expect(offReply([])).toContain("quay lại làm bài");
  });
});

describe("wrongResult: số học sinh nêu không khớp bài (phiên 2d74de3d)", () => {
  const base = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  const p = { ...base, statement: "Hình chữ nhật dài 12 m, rộng 8 m. Tính chu vi và diện tích.", data: { chieudai: "12 m", chieurong: "8 m" }, solution: { chu_vi: 40, dien_tich: 96 }, solution_steps: ["$(12 + 8) \\times 2$", "$12 + 8 = 20$", "$20 \\times 2 = 40$", "$12 \\times 8 = 96$"] };
  it("kết quả sai thì báo", () => {
    expect(wrongResult(p, "chu vi = (12 + 8) * 2 = 41\ns = 12 * 8 = 90")).toEqual(["41", "90"]);
    expect(wrongResult(p, "41 và 90")).toEqual(["41", "90"]);
  });
  it("kết quả đúng, trung gian đúng, hoặc chỉ có số của đề thì không báo", () => {
    expect(wrongResult(p, "chu vi = 40\ndiện tích = 96")).toEqual([]);
    expect(wrongResult(p, "12 + 8 = 20")).toEqual([]);
    expect(wrongResult(p, "chiều dài 12, chiều rộng 8")).toEqual([]);
    expect(wrongResult(p, "chu vi = 40, diện tích = 90")).toEqual([]); // có số khớp thì không chắc: để AI nhận xét
  });
  it("đề không có đáp án số thì không báo", () => {
    expect(wrongResult({ ...p, solution: { kq: "vô nghiệm" } }, "x = 41")).toEqual([]);
  });
});

describe("leaksCalc: nhắc lại phép của học sinh", () => {
  const sol = { chu_vi: 40, dien_tich: 96 }, given = ["12 m", "8 m"], steps = ["$12 + 8 = 20$", "$20 \\times 2 = 40$"];
  it("phép học sinh đã viết, chưa kèm kết quả thì không chặn", () => {
    expect(leaksCalc("Bạn kiểm tra lại phép $12 + 8$ nhé.", sol, given, steps, "chu vi = (12 + 8) * 2 = 41")).toBe(false);
  });
  it("viết kết quả ra thì vẫn chặn", () => {
    expect(leaksCalc("Phép $12 + 8 = 20$ mới đúng.", sol, given, steps, "chu vi = (12 + 8) * 2 = 41")).toBe(true);
  });
  it("phép học sinh chưa viết thì vẫn chặn", () => {
    expect(leaksCalc("Bạn thử cộng $12 + 8$ xem.", sol, given, steps, "chu vi = 41")).toBe(true);
  });
});

describe("wrongResult: không báo oan nhãn bước và lời dẫn", () => {
  const base = parseProblems(SEED).ok.find((x) => x.id === "TC02")!;
  const p = { ...base, statement: "Hình chữ nhật dài 12 m, rộng 8 m. Tính chu vi và diện tích.", data: { chieudai: "12 m", chieurong: "8 m" }, solution: { chu_vi: 40, dien_tich: 96 }, solution_steps: ["$(12 + 8) \times 2$", "$20 \times 2 = 40$", "$12 \times 8 = 96$"] };
  it("nhãn bước và lời dẫn không có dấu = thì không báo", () => {
    expect(wrongResult(p, "Bước 2: gọi x là chu vi")).toEqual([]);
    expect(wrongResult(p, "Câu 1 em làm như sau")).toEqual([]);
  });
});
