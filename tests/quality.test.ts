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
    const p = base({ solution: { saved: 45000, cost: 255000 } });
    expect(lintProblem(p)).toEqual([]);
  });
  it("lời giải chỉ 1 bước thì nhắc chuẩn hóa lại", () => {
    expect(lintProblem(base({ solution_steps: ["Phải trả 255000."] })).join("|")).toContain("chuẩn hóa lại");
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

import { descriptiveSteps } from "../lib/lint";
import { looksLikeQuestion } from "../lib/chat/intent";

describe("descriptiveSteps: bước chỉ mô tả cách làm", () => {
  const base = { statement: "Chiều dài 12 m, chiều rộng 8 m. Tính chu vi." };
  it("bước chỉ có chữ bị bắt, bước có số hoặc dấu = thì không", () => {
    const p = { ...base, solution_steps: ["Ta tính chu vi bằng cách lấy tổng chiều dài và chiều rộng rồi nhân đôi.", "Tổng là $12 + 8 = 20$.", "Chu vi là $20 \times 2 = 40$.", "Vậy chu vi là 40 m."] };
    expect(descriptiveSteps(p)).toEqual([0]);
  });
  it("bước cuối và bước 'Vậy…' bằng chữ là bình thường; đề không có số thì không xét", () => {
    expect(descriptiveSteps({ ...base, solution_steps: ["Tổng là $12 + 8 = 20$.", "Vậy hình đó có chu vi lớn."] })).toEqual([]);
    expect(descriptiveSteps({ statement: "Chứng minh tam giác cân.", solution_steps: ["Hai cạnh bằng nhau.", "Kết luận."] })).toEqual([]);
  });
});

describe("looksLikeQuestion: cụm 'bằng cách' không phải câu hỏi", () => {
  it("lời giải có 'bằng cách' không bị nhắc nhầm, câu hỏi thật vẫn bắt", () => {
    expect(looksLikeQuestion("Ta tính chu vi bằng cách lấy tổng chiều dài và chiều rộng rồi nhân với 2.")).toBe(false);
    expect(looksLikeQuestion("Cách làm thế nào?")).toBe(true);
    expect(looksLikeQuestion("làm cách nào để tìm x")).toBe(true);
    expect(looksLikeQuestion("Đề hỏi gì vậy")).toBe(true);
  });
});
