import { describe, expect, it } from "vitest";
import { checkpoints, hasNum } from "../lib/chat/progress";
import { trapReply } from "../lib/chat/traps";
import { problemSchema } from "../lib/schema/problem";

describe("hasNum: số thập phân", () => {
  it("1.5 không khớp nhầm 1/5 hay 1 5 (dấu chấm phải thoát)", () => {
    expect(hasNum("Bước 1/5: Biến đổi hệ", "1.5")).toBe(false);
    expect(hasNum("sau 0 5", "0.5")).toBe(false);
    expect(hasNum("x = 1,5", "1.5")).toBe(true);
  });
});

describe("trapReply: bẫy không bắn nhầm lời đúng", () => {
  const p = problemSchema.parse({
    id: "HP", title: "t", statement: "An mua 3 quyển vở và 2 cây bút hết 41.000 đồng.", solution: { x: 9000 },
    solution_steps: ["Gọi $x$ là giá một quyển vở, $y$ là giá một cây bút với điều kiện $x > 0, y > 0$.", "Ta có $3x + 2y = 41000$."],
    step_checks: [{ result: "", accepts: [] }, { result: "3x + 2y = 41000", accepts: [] }],
    error_traps: [{ step: 1, wrong: "x > 0", why: "Bạn quên đặt điều kiện." }, { step: 2, wrong: "2x + 3y = 41000", why: "Bạn nhầm hệ số." }],
    hints: [1, 2, 3].map((level) => ({ level, text: "g" })),
  });
  const cps = checkpoints(p);
  it("bước không có số/chữ để server kiểm: không dùng bẫy (để AI phán)", () => {
    expect(trapReply(p, cps[0], "Gọi x là giá vở, y là giá bút với điều kiện x > 0, y > 0", [])).toBe("");
  });
  it("bẫy thật ở bước kiểm được vẫn hoạt động", () => {
    expect(trapReply(p, cps[1], "2x + 3y = 41000", [])).toContain("nhầm hệ số");
  });
});

describe("verify: bằng chứng AI bị JSON nuốt dấu gạch chéo ngược", () => {
  it("evidence có tab + 'imes' vẫn khớp bài làm có \times", async () => {
    const { verify } = await import("../lib/chat/progress");
    const cp = { id: 0, label: "x", anchors: [], must: [] };
    const said = String.raw`ta tính được $x = 7 - 2 \times 2 = 3$.`;
    expect(verify(cp, "ta tính được $x = 7 - 2 \times 2 = 3$.", said)).toBe(true);
    expect(verify(cp, "ta tính được $x = 99$.", said)).toBe(false);
  });
});

describe("hasNum: phân số viết thẳng", () => {
  it("3/2 khớp 1.5, nhưng 'Bước 1/5' không bị đổi", () => {
    expect(hasNum("Cộng vế ta được x = 3/2", "1.5")).toBe(true);
    expect(hasNum("nghiệm (3/2; 1/2)", "0.5")).toBe(true);
    expect(hasNum("Bước 1/5: Biến đổi", "0.2")).toBe(false);
    expect(hasNum("300000/10000 = 30", "30")).toBe(true);
  });
});
