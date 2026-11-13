import { describe, expect, it, vi } from "vitest";
import { freeCode, pool } from "../lib/batch";
import { problemSchema, type Problem } from "../lib/schema/problem";

vi.mock("../lib/llm", () => ({ askJson: vi.fn(), askText: vi.fn() }));
vi.mock("../lib/verify-solution", () => ({ crossCheck: vi.fn(), checkSteps: vi.fn(async () => ""), substituteState: vi.fn(() => ({ state: "skip", msg: "" })) }));
vi.mock("../lib/step-all", () => ({ guidesFor: vi.fn() })); // chỉ dẫn do một lượt gộp viết; test giả lập kết quả của nó
import { finishProblem, standardizeProblem, unaccented } from "../lib/fill";
import { repairProblem } from "../lib/repair";
import { checkSteps, crossCheck } from "../lib/verify-solution";
import { guidesFor } from "../lib/step-all";
import { withGuides, type Guides } from "../lib/step-guides";
const asP = (g: Guides) => async (_c: unknown, p: Problem) => withGuides(p, g);

const cfg = { provider: "gemini", model: "m", key: "k" } as never;
const base = (over: Partial<Problem> = {}): Problem => problemSchema.parse({
  id: "T1", title: "Tiền", statement: "An có 300000 đồng, giảm 15%.", data: { budget: 300000 }, solution: { cost: 255000 },
  solution_steps: ["Tiền giảm là 300000 x 0,15 = 45000.", "Phải trả 300000 - 45000 = 255000."],
  hints: [1, 2, 3].map((level) => ({ level, text: "Gợi ý." })), reviewed: false, ...over,
});
// Lượt giải độc lập của bỏ phiếu đi qua lib/solve.ts (askText, văn bản có thẻ).
const tag = (v: string) => `<loi_giai>\nBước 1.\n</loi_giai>\n<dap_an>\ncost = ${v}\n</dap_an>`;
const guides = { goals: ["Tính tiền giảm", "Tính số tiền phải trả"], hints: [["a", "b", "c"], ["a", "b", "c"]], checks: [{ result: "45000", accepts: [] }, { result: "255000", accepts: [] }], traps: [] };

describe("freeCode", () => {
  it("đánh số tiếp, không trùng", () => {
    const taken = new Set(["BT01", "BT02", "TC10"]);
    expect(freeCode("BT01", taken)).toBe("BT03");
    expect(freeCode("tc10", taken)).toBe("TC11");
    expect(freeCode("BT05", taken)).toBe("BT05");
  });
});

describe("pool", () => {
  it("chạy hết khi còn thời gian; hết giờ thì trả phần chưa bắt đầu", async () => {
    const seen: number[] = [];
    expect(await pool([1, 2, 3, 4, 5], 2, Date.now() + 10_000, async (x) => { seen.push(x); })).toEqual([]);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(await pool([1, 2, 3], 2, Date.now() - 1, async () => {})).toEqual([1, 2, 3]);
  });
});

describe("finishProblem", () => {
  it("đề AI mới: kiểm chéo khớp, viết chỉ dẫn, đặt đã duyệt", async () => {
    vi.mocked(crossCheck).mockResolvedValue("");
    vi.mocked(guidesFor).mockImplementation(asP(guides));
    const r = await finishProblem(cfg, base());
    expect(typeof r).toBe("object");
    expect(r).toMatchObject({ reviewed: true, check_note: "", step_goals: guides.goals });
  });
  it("kiểm chéo lệch thì trả lỗi, không lưu đề dở", async () => {
    vi.mocked(crossCheck).mockResolvedValue("Kiểm chéo đáp án: lệch");
    expect(await finishProblem(cfg, base())).toContain("lệch");
  });
  it("chỉ dẫn lộ kết quả: viết lại; vẫn lộ thì lỗi", async () => {
    vi.mocked(crossCheck).mockResolvedValue("");
    const leak = { ...guides, goals: ["Tính tiền giảm, ra 45000", "Tính số tiền phải trả"] };
    vi.mocked(guidesFor).mockReset().mockImplementationOnce(asP(leak)).mockImplementationOnce(asP(guides));
    expect(await finishProblem(cfg, base())).toMatchObject({ reviewed: true });
    vi.mocked(guidesFor).mockReset().mockImplementation(asP(leak));
    expect(await finishProblem(cfg, base())).toContain("chưa làm đề này đạt chuẩn");
  });
  it("lời giải có phép tính sai: viết lại một lần; vẫn sai thì lỗi", async () => {
    const { askJson } = await import("../lib/llm");
    vi.mocked(crossCheck).mockResolvedValue("");
    vi.mocked(guidesFor).mockReset().mockImplementation(asP(guides));
    vi.mocked(checkSteps).mockReset().mockResolvedValueOnce("Bước 2 sai").mockResolvedValueOnce("");
    vi.mocked(askJson).mockReset().mockResolvedValueOnce({ steps: ["Tiền giảm là 300000 x 0,15 = 45000.", "Phải trả 300000 - 45000 = 255000."] });
    expect(await finishProblem(cfg, base())).toMatchObject({ reviewed: true });
    expect(askJson).toHaveBeenCalledTimes(3);
    vi.mocked(checkSteps).mockReset().mockResolvedValue("Bước 2 sai");
    vi.mocked(askJson).mockReset().mockResolvedValue({ steps: ["Tiền giảm là 300000 x 0,15 = 45000.", "Phải trả 300000 - 45000 = 255000."] });
    expect(await finishProblem(cfg, base())).toContain("chưa đạt");
    vi.mocked(checkSteps).mockReset().mockResolvedValue("");
  });
  it("đề giáo viên đã duyệt: không kiểm chéo lại", async () => {
    vi.mocked(crossCheck).mockClear();
    vi.mocked(guidesFor).mockReset().mockImplementation(asP(guides));
    await finishProblem(cfg, base({ reviewed: true }));
    expect(crossCheck).not.toHaveBeenCalled();
  });
});

describe("repairProblem + standardizeProblem", () => {
  const TAB = String.fromCharCode(9), NL = String.fromCharCode(10), BS = String.fromCharCode(92);
  // JSON nuốt dấu \: \times -> tab + "imes"; \neq -> xuống dòng + "eq" (bước bị cắt đôi)
  const broken = () => base({
    reviewed: true, solution: { x: 4 },
    solution_steps: ["Bước 1: Điều kiện $x" + "", "eq 0$.", "Bước 2: Tính $2 " + TAB + "imes 2 = 4$ và $x = 4$."],
    step_goals: ["a", "b", "c"], step_hints: [["a", "b", "c"], ["a", "b", "c"], ["a", "b", "c"]], step_checks: [{ result: "", accepts: [] }, { result: "", accepts: [] }, { result: "", accepts: [] }],
  });
  it("nối bước vỡ, trả lệnh LaTeX, xóa chỉ dẫn cũ khi số bước đổi; đề lành giữ nguyên đối tượng", () => {
    const r = repairProblem(broken());
    expect(r.solution_steps).toEqual([`Điều kiện $x${BS}neq 0$.`, `Tính $2 ${BS}times 2 = 4$ và $x = 4$.`]);
    expect(r.step_goals).toEqual([]);
    const ok = base();
    expect(repairProblem(ok)).toBe(ok);
    expect(NL).toBe("\n");
  });
  it("standardizeProblem: lấy statement làm gốc, thay data, đáp án, lời giải cũ (đề lệch như TC05)", async () => {
    const { askJson, askText } = await import("../lib/llm");
    vi.mocked(crossCheck).mockResolvedValue("");
    vi.mocked(guidesFor).mockReset().mockImplementation(asP(guides));
    vi.mocked(askText).mockReset().mockResolvedValueOnce(tag("255000")); // phiếu 2 trùng phiếu 1: đủ, không giải lượt thứ ba
    vi.mocked(askJson).mockReset()
      .mockResolvedValueOnce({ data: [{ name: "budget", value: "300000" }, { name: "rate", value: "0.15" }], answers: [{ name: "cost", value: "255000" }], skills: ["Tính phần trăm"], learning_objectives: ["Tính giá sau giảm"], common_errors: ["Quên trừ tiền giảm"], hints: ["h1", "h2", "h3"], extension: "Giảm 20% thì sao?" })
      .mockResolvedValueOnce({ steps: ["Tiền giảm là 300000 x 0,15 = 45000.", "Phải trả 300000 - 45000 = 255000."] });
    const stale = base({ common_errors: ["Dùng lãi đơn"], extension: "Gửi 3 năm?", skills: ["Lãi kép"], learning_objectives: ["Phân biệt lãi"], data: { principal: 50000000 }, solution: { simple_total: 56000000 }, solution_steps: ["Lãi đơn 56.000.000."], check_note: "lệch", reviewed: true });
    const r = await standardizeProblem(cfg, stale) as Problem;
    expect(r).toMatchObject({ reviewed: true, check_note: "", data: { budget: 300000, rate: 0.15 }, solution: { cost: 255000 } });
    expect(r.solution_steps.join(" ")).not.toContain("56.000.000");
    expect(r).toMatchObject({ common_errors: ["Quên trừ tiền giảm"], extension: "Giảm 20% thì sao?", skills: ["Tính phần trăm"], learning_objectives: ["Tính giá sau giảm"] });
    expect(r.hints.map((h) => h.text)).toEqual(["h1", "h2", "h3"]);
    expect(askJson).toHaveBeenCalledTimes(4); // tạo lại + lời giải + dạng cần viết + giàn đỡ
    expect(askText).toHaveBeenCalledTimes(1); // 1 phiếu giải độc lập
  });
  const derive = (v: string) => ({ data: [], answers: [{ name: "cost", value: v }], skills: ["a"], learning_objectives: ["b"], common_errors: ["c"], hints: ["h1", "h2", "h3"], extension: "e" });
  it("standardizeProblem: AI giải 3 lần khác nhau thì báo chưa có đáp án đáng tin, không ghi đè", async () => {
    const { askJson, askText } = await import("../lib/llm");
    vi.mocked(askJson).mockReset().mockResolvedValueOnce(derive("1"));
    vi.mocked(askText).mockReset().mockResolvedValueOnce(tag("2")).mockResolvedValueOnce(tag("3"));
    const r = await standardizeProblem(cfg, base({ solution: {}, reviewed: false }));
    expect(r).toContain("Chưa có đáp án đáng tin");
  });
  it("standardizeProblem: đáp án chưa khóa dù đã duyệt vẫn phải bỏ phiếu (không tin đáp án AI cũ)", async () => {
    const { askJson, askText } = await import("../lib/llm");
    vi.mocked(askJson).mockReset().mockResolvedValueOnce(derive("1"));
    vi.mocked(askText).mockReset().mockResolvedValueOnce(tag("2")).mockResolvedValueOnce(tag("3"));
    expect(await standardizeProblem(cfg, base({ reviewed: true, check_note: "", answer_locked: false }))).toContain("Chưa có đáp án đáng tin");
  });
  it("standardizeProblem: đáp án giáo viên đã khóa được giữ nguyên, không bỏ phiếu", async () => {
    const { askJson } = await import("../lib/llm");
    vi.mocked(crossCheck).mockClear();
    vi.mocked(askJson).mockReset().mockResolvedValueOnce(derive("77")).mockResolvedValueOnce({ steps: ["Tiền giảm là 300000 x 0,15 = 45000.", "Phải trả 300000 - 45000 = 255000."] });
    const r = await standardizeProblem(cfg, base({ reviewed: true, answer_locked: true })) as Problem;
    expect(r.solution).toEqual({ cost: 255000 });
    expect(r.answer_locked).toBe(true);
    expect(askJson).toHaveBeenCalledTimes(4); // tạo lại + lời giải + dạng cần viết + giàn đỡ
    expect(crossCheck).not.toHaveBeenCalled();
  });
  it("unaccented: khối chữ không dấu bị bắt, có dấu thì qua", () => {
    const ok = { skills: ["Tính phần trăm"], learning_objectives: ["Tính giá sau giảm giá"], common_errors: ["Quên trừ tiền giảm khi tính tổng"], hints: ["Em hãy nhắc lại điều kiện", "b", "c"], extension: "Giảm 20% thì sao?" };
    expect(unaccented(ok)).toBe(false);
    expect(unaccented({ ...ok, hints: ["Em hay nhac lai dieu kien de he phuong trinh vo nghiem", "b", "c"] })).toBe(true);
  });
  it("problemSchema: statement bắt buộc", () => {
    expect(problemSchema.safeParse({ id: "T", title: "t", solution: {}, hints: [1, 2, 3].map((level) => ({ level, text: "g" })) }).success).toBe(false);
  });
});

describe("repairProblem: chuẩn hóa lời giải", () => {
  it("bỏ tiền tố, giữ chỉ dẫn khi số bước không đổi", () => {
    const r = repairProblem({ ...base(), solution_steps: ["Bước 1: a = 1.", "Bước 2: b = 2."] });
    expect(r.solution_steps).toEqual(["a = 1.", "b = 2."]);
    expect(r.step_goals).toEqual(base().step_goals);
  });
  it("tách một chuỗi chứa nhiều Bước N, xóa chỉ dẫn cũ", () => {
    const r = repairProblem({ ...base(), solution_steps: ["Bước 1: a = 1. Bước 2: b = 2."] });
    expect(r.solution_steps).toEqual(["a = 1.", "b = 2."]);
    expect(r.step_goals).toEqual([]);
  });
});
