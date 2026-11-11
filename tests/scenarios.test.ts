import { describe, expect, it } from "vitest";
import { SCENARIOS, scenarioReply } from "../lib/chat/scenarios";
import { stepExample, stepFormat } from "../lib/chat/goals";
import { problemSchema } from "../lib/schema/problem";

const step = { no: 1, n: 8, goal: "Thay giá trị của tham số vào hệ phương trình", format: "Viết lại hệ với giá trị m đã cho, mỗi phương trình có dấu =" };

describe("scenarioReply: câu phản hồi do server ghép theo kịch bản", () => {
  it("mọi kịch bản đều nêu việc cần làm của bước", () => {
    for (const sc of SCENARIOS) expect(scenarioReply(sc, step), sc).toContain("Việc cần làm ở bước 1/8: Thay giá trị của tham số vào hệ phương trình.");
  });
  it("kịch bản về cách viết thì kèm dạng cần viết; hỏi lại và xin đáp án thì không", () => {
    for (const sc of ["dang_do", "thieu_dau_bang", "sai_dang", "chua_lam"] as const) expect(scenarioReply(sc, step)).toContain("Cần viết: Viết lại hệ");
    for (const sc of ["hoi_lai", "xin_dap_an"] as const) expect(scenarioReply(sc, step)).not.toContain("Cần viết");
  });
  it("tin dở dang không bị bảo 'thêm dấu =' một cách máy móc", () => {
    expect(scenarioReply("dang_do", step)).not.toMatch(/thêm dấu =/);
  });
  it("thiếu dạng cần viết thì vẫn nói được, không có dòng Cần viết", () => {
    const r = scenarioReply("dang_do", { ...step, format: "" });
    expect(r).toContain("Việc cần làm");
    expect(r).not.toContain("Cần viết");
  });
  it("không lặp lại đúng câu dẫn của lượt trước", () => {
    const first = scenarioReply("dang_do", step);
    for (let i = 0; i < 20; i++) expect(scenarioReply("dang_do", step, first).split(" Việc cần làm")[0]).not.toBe(first.split(" Việc cần làm")[0]);
  });
});

describe("stepFormat / stepExample", () => {
  const base = problemSchema.parse({
    id: "T1", title: "t", statement: "Giải hệ x + y = 5, x - y = 1.", solution: { x: 3, y: 2 },
    solution_steps: ["Cộng hai vế: 2x = 6.", "Vậy x = 3, y = 2."], hints: [1, 2, 3].map((level) => ({ level, text: "g" })),
    step_formats: ["Viết một phương trình sau khi cộng hai vế", "Viết kết luận nghiệm"], step_examples: ["a + b = 7", "x = 99"],
  });
  it("trả đúng bước", () => { expect(stepFormat(base, 0)).toContain("cộng hai vế"); expect(stepExample(base, 0)).toBe("a + b = 7"); });
  it("lệch số bước thì không dùng", () => { expect(stepFormat({ ...base, step_formats: ["một"] }, 0)).toBe(""); });
  it("đề cũ chưa có thì rỗng", () => { const { step_formats, step_examples, ...rest } = base; void step_formats; void step_examples; expect(stepFormat(problemSchema.parse(rest), 0)).toBe(""); });
  it("chặn ví dụ lộ kết quả của đề", () => { expect(stepExample({ ...base, step_examples: ["x = 3", "y = 2"] }, 1)).toBe(""); });
});
