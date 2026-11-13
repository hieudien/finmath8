import { describe, expect, it, vi } from "vitest";
import { problemSchema, type Problem } from "../lib/schema/problem";

vi.mock("../lib/llm", () => ({ askJson: vi.fn() }));
vi.mock("../lib/errors", () => ({ reportError: vi.fn(async () => {}) }));
import { askJson } from "../lib/llm";
import { reportError } from "../lib/errors";
import { guidesFor, makeStepAll } from "../lib/step-all";
import { noAccent } from "../lib/step-guides";

const base = (): Problem => problemSchema.parse({
  id: "T1", title: "Tiền", statement: "An có 300000 đồng, giảm 15%.", data: { budget: 300000, discount: 0.15 },
  solution: { saved: 45000, cost: 255000 }, solution_steps: ["Tiền giảm là 300000 x 0,15 = 45000.", "Phải trả 300000 - 45000 = 255000."],
  hints: [1, 2, 3].map((level) => ({ level, text: "g" + level })),
});
const step = (over: object = {}) => ({ goal: "Tính tiền giảm", hints: ["a a a", "b b b", "c c c"], result: "45000", accepts: [], traps: [], format: "số tiền được giảm", example: "200 x 10 / 100", subs: ["Đề cho biết số nào?", "Cần tìm đại lượng nào?"], analog: "", ...over });
const two = (a: object = {}, b: object = {}) => ({ steps: [step(a), step({ goal: "Tính số tiền phải trả", result: "255000", format: "số tiền phải trả", ...b })] });

describe("makeStepAll: một lượt thay ba lượt", () => {
  it("điền đủ chỉ dẫn, dạng cần viết và giàn đỡ; kết quả bịa bị bỏ", async () => {
    vi.mocked(askJson).mockReset().mockResolvedValueOnce(two({}, { result: "777777" }) as never);
    const a = await makeStepAll({ provider: "gemini", key: "k", model: "m", temperature: 0 }, base());
    expect(a!.goals).toEqual(["Tính tiền giảm", "Tính số tiền phải trả"]);
    expect(a!.checks.map((c) => c.result)).toEqual(["45000", ""]); // 777777 không có trong lời giải bước
    expect(a!.formats).toEqual(["số tiền được giảm", "số tiền phải trả"]);
    expect(a!.subs[0]).toHaveLength(2);
    expect(vi.mocked(askJson)).toHaveBeenCalledTimes(1);
  });
  it("lộ kết quả thì bỏ; ví dụ lộ số đáp án thì bù bằng makeStepFormats", async () => {
    vi.mocked(askJson).mockReset()
      .mockResolvedValueOnce(two({ goal: "Tính tiền giảm, ra 45000", example: "tiền giảm là 45000" }) as never) // lượt gộp: goal và ví dụ lộ
      .mockResolvedValueOnce({ steps: [{ format: "số tiền được giảm", example: "200 x 10 / 100" }, { format: "số tiền phải trả", example: "200 - 20" }] } as never); // bù ví dụ
    const a = await makeStepAll({ provider: "gemini", key: "k", model: "m", temperature: 0 }, base());
    expect(a!.goals[0]).toBe(""); // goal lộ bị bỏ
    expect(a!.examples[0]).toBe("200 x 10 / 100"); // ví dụ lộ đã được thay bằng bản bù
    expect(vi.mocked(askJson)).toHaveBeenCalledTimes(2);
  });
  it("lệch số bước: thử lại, vẫn lệch thì null", async () => {
    vi.mocked(reportError).mockClear();
    vi.mocked(askJson).mockReset().mockResolvedValue({ steps: [step()] } as never);
    expect(await makeStepAll({ provider: "gemini", key: "k", model: "m", temperature: 0 }, base())).toBeNull();
    expect(vi.mocked(askJson)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(reportError)).toHaveBeenCalledTimes(3); // mỗi lần lệch số bước đều ghi nhật ký lỗi như makeStepGuides cũ
  });
});

describe("noAccent: chuỗi tiếng Việt viết không dấu", () => {
  it("bắt các mẫu thật model từng trả", () => {
    for (const s of ["thay m = 2 vao he", "vay he co nghiem la (2; 1)", "mo ngoac 5 cong 3 dong ngoac nhan 2", "5 nhan 3", "chu vi la 16 met va dien tich la 15 met vuong", "cap nghiem la (3; 2)"]) expect(noAccent(s), s).toBe(true); // thiếu dấu một phần ("vào he") thì chưa bắt được: chỉ có prompt nhắc
  });
  it("không bắt chuỗi đúng chính tả, công thức, hay có dấu đầy đủ", () => {
    for (const s of ["2x = 14 - 6", "a khác 0", "5x = 15 suy ra x = 3", "12 chia 3", "phép tính chu vi", "hệ phương trình sau khi thay giá trị của m", "y = (m + 6)/7", "\\begin{cases} x + y = 3 \\\\ x - y = 1 \\end{cases}", "$x = 4 - 2y$ thì y = 1", "x = 2 và y = 1", "AB + BC = AC", "AB = CD = EF", "MN // PQ", "sin x = cos x"]) expect(noAccent(s), s).toBe(false);
  });
});

describe("guidesFor", () => {
  it("lượt gộp hỏng thì rơi về makeStepGuides cũ (chỉ có chỉ dẫn)", async () => {
    const old = { steps: [step({ format: undefined }), step({ goal: "Tính số tiền phải trả", result: "255000" })] };
    vi.mocked(askJson).mockReset()
      .mockResolvedValue({ steps: [step()] } as never) // 3 lượt gộp đều lệch số bước
      .mockResolvedValueOnce({ steps: [step()] } as never).mockResolvedValueOnce({ steps: [step()] } as never).mockResolvedValueOnce({ steps: [step()] } as never)
      .mockResolvedValueOnce(old as never); // makeStepGuides cũ
    const q = await guidesFor({ provider: "gemini", key: "k", model: "m", temperature: 0 }, base());
    expect(q!.step_goals).toHaveLength(2);
    expect(q!.step_formats).toEqual([]); // formats/scaffold để finishProblem bổ sung như trước
  });
  it("lượt gộp tốt thì điền đủ mọi trường", async () => {
    vi.mocked(askJson).mockReset().mockResolvedValueOnce(two() as never);
    const q = await guidesFor({ provider: "gemini", key: "k", model: "m", temperature: 0 }, base());
    expect(q!.step_goals).toHaveLength(2);
    expect(q!.step_formats).toHaveLength(2);
    expect(q!.step_subs).toHaveLength(2);
  });
});
