import { describe, expect, it, vi } from "vitest";
import { problemSchema, type Problem } from "../lib/schema/problem";

vi.mock("../lib/llm", () => ({ askJson: vi.fn() }));
vi.mock("../lib/errors", () => ({ reportError: vi.fn(async () => {}) }));
import { askJson } from "../lib/llm";
import { reportError } from "../lib/errors";
import { guidesFor, makeStepChecks } from "../lib/step-all";

const cfg = { provider: "gemini", key: "k", model: "m", temperature: 0 } as const;
const base = (): Problem => problemSchema.parse({
  id: "T1", title: "Tiền", statement: "An có 300000 đồng, giảm 15%.", data: { budget: 300000, discount: 0.15 },
  solution: { saved: 45000, cost: 255000 }, solution_steps: ["Tiền giảm là 300000 x 0,15 = 45000.", "Phải trả 300000 - 45000 = 255000."],
  hints: [1, 2, 3].map((level) => ({ level, text: "g" + level })),
});
const step = (over: object = {}) => ({ result: "45000", accepts: [], traps: [], ...over });
const two = (a: object = {}, b: object = {}) => ({ steps: [step(a), step({ result: "255000", ...b })] });

describe("makeStepChecks: chỉ kết quả chuẩn và sai lầm theo bước", () => {
  it("điền kết quả chuẩn; kết quả bịa bị bỏ; một lượt gọi AI", async () => {
    vi.mocked(askJson).mockReset().mockResolvedValueOnce(two({}, { result: "777777" }) as never);
    const a = await makeStepChecks(cfg, base());
    expect(a!.checks.map((c) => c.result)).toEqual(["45000", ""]); // 777777 không có trong lời giải bước
    expect(vi.mocked(askJson)).toHaveBeenCalledTimes(1);
  });
  it("sai lầm gắn bước: giữ, bỏ nếu lộ kết quả hoặc trùng kết quả đúng", async () => {
    vi.mocked(askJson).mockReset().mockResolvedValueOnce(two({ traps: [{ wrong: "4500", why: "Bạn kiểm tra lại phép nhân nhé." }, { wrong: "45000", why: "trùng đáp án" }, { wrong: "3000", why: "Kết quả đúng là 45000 đó." }] }) as never);
    const a = await makeStepChecks(cfg, base());
    expect(a!.traps).toEqual([{ step: 1, wrong: "4500", why: "Bạn kiểm tra lại phép nhân nhé." }]);
  });
  it("lệch số bước: thử lại, vẫn lệch thì null", async () => {
    vi.mocked(reportError).mockClear();
    vi.mocked(askJson).mockReset().mockResolvedValue({ steps: [step()] } as never);
    expect(await makeStepChecks(cfg, base())).toBeNull();
    expect(vi.mocked(askJson)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(reportError)).toHaveBeenCalledTimes(3);
  });
});

describe("guidesFor", () => {
  it("chỉ ghi step_checks và error_traps, xóa mọi chỉ dẫn theo bước cũ", async () => {
    vi.mocked(askJson).mockReset().mockResolvedValueOnce(two() as never);
    const old = { ...base(), step_goals: ["a", "b"], step_hints: [["x"], ["y"]] };
    const q = await guidesFor(cfg, old);
    expect(q!.step_checks).toHaveLength(2);
    for (const k of ["step_goals", "step_hints"] as const) expect(q![k], k).toEqual([]);
  });
  it("AI hỏng thì null", async () => {
    vi.mocked(askJson).mockReset().mockResolvedValue({ steps: [] } as never);
    expect(await guidesFor(cfg, base())).toBeNull();
  });
});
