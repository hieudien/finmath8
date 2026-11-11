import { describe, expect, it } from "vitest";
import { cleanFormat, SCENARIOS, scenarioReply, withAiLine } from "../lib/chat/scenarios";
import { stepExample, stepFormat } from "../lib/chat/goals";
import { problemSchema } from "../lib/schema/problem";
import { ladder } from "../lib/chat/assist";

const step = { no: 1, n: 8, goal: "Thay m = 1 vào hệ phương trình (I)", format: "hệ phương trình mới sau khi thay m = 1" };

describe("scenarioReply: câu mẫu do server ghép theo kịch bản", () => {
  it("lần đầu không lặp việc cần làm (khung trên ô nhập đã hiện), chỉ có lời dẫn + dạng cần viết", () => {
    for (const sc of ["dang_do", "sai_so", "khong_lien_quan"] as const) {
      const r = scenarioReply(sc, step);
      expect(r, sc).not.toContain("Việc cần làm");
      expect(r).toContain("Bạn thử viết ra hệ phương trình mới sau khi thay m = 1 nhé.");
    }
  });
  it("từ lần 2 nhắc việc cần làm, từ lần 3 trỏ nút Gợi ý", () => {
    for (const sc of SCENARIOS) expect(scenarioReply(sc, { ...step, tries: 2 }), sc).toContain("Việc cần làm ở bước 1/8: Thay m = 1 vào hệ phương trình (I).");
    expect(scenarioReply("sai_so", { ...step, tries: 2 })).not.toContain("Gợi ý");
    expect(scenarioReply("sai_so", { ...step, tries: 3 })).toContain("bấm Gợi ý");
  });
  it("hỏi lại và xin đáp án không kèm dạng cần viết", () => {
    for (const sc of ["hoi_lai", "xin_dap_an"] as const) expect(scenarioReply(sc, step)).not.toContain("viết ra");
  });
  it("không khen ở mọi kịch bản (phân loại có thể sai)", () => {
    for (const sc of SCENARIOS) for (let i = 0; i < 12; i++) expect(scenarioReply(sc, step), sc).not.toMatch(/ổn|đúng rồi|tốt|giỏi|chính xác|gần đúng|gần được/i);
  });
  it("không có 'Cần viết:' hay 'viết ra Viết', không bảo thêm dấu = máy móc", () => {
    const r = scenarioReply("dang_do", { ...step, format: "Viết lại hệ phương trình sau khi thay, mỗi phương trình một dòng có dấu =" });
    expect(r).not.toMatch(/Cần viết:|viết ra Viết|mỗi phương trình một dòng|thêm dấu =/);
    expect(r).toContain("Bạn thử viết ra hệ phương trình sau khi thay nhé.");
  });
  it("thiếu dạng cần viết thì vẫn nói được", () => {
    const r = scenarioReply("dang_do", { ...step, format: "", tries: 2 });
    expect(r).toContain("Việc cần làm");
    expect(r).not.toContain("viết ra");
  });
  it("không lặp lại đúng câu dẫn của lượt trước", () => {
    const first = scenarioReply("dang_do", step);
    for (let i = 0; i < 20; i++) expect(scenarioReply("dang_do", step, first)).not.toBe(first);
  });
});

describe("withAiLine: câu AI nhắc đúng điều học sinh viết + phần cố định", () => {
  it("học sinh chưa ra đúng đối tượng: câu AI + dạng cần viết (lần 1), thêm việc cần làm (từ lần 2)", () => {
    expect(withAiLine("khong_lien_quan", "Phương trình x + y = 5 chưa lấy từ hệ của đề", step)).toBe("Phương trình x + y = 5 chưa lấy từ hệ của đề. Bạn thử viết ra hệ phương trình mới sau khi thay m = 1 nhé.");
    expect(withAiLine("chua_lam", "Bạn chưa thay m = 1.", { ...step, tries: 2 })).toContain("Việc cần làm ở bước 1/8");
  });
  it("AI đã chỉ chỗ sai (sai số, thiếu, sai hướng): câu AI đứng một mình, không dán lại việc cần làm", () => {
    for (const sc of ["sai_so", "dung_huong_thieu", "sai_phuong_phap", "thieu_dau_bang"] as const)
      for (const tries of [1, 2, 3]) expect(withAiLine(sc, "Vế phải của phương trình đầu chưa khớp", { ...step, tries })).toBe("Vế phải của phương trình đầu chưa khớp.");
  });
});

describe("cleanFormat: dọn dạng cần viết của đề cũ", () => {
  it("bỏ động từ Viết đầu câu và cụm bố cục", () => {
    expect(cleanFormat("Viết hệ phương trình mới, mỗi phương trình một dòng có dấu =")).toBe("hệ phương trình mới");
    expect(cleanFormat("Viết lại hệ phương trình sau khi thay giá trị của tham số, mỗi phương trình một dòng có dấu =.")).toBe("hệ phương trình sau khi thay giá trị của tham số");
    expect(cleanFormat("một phương trình theo ẩn x")).toBe("một phương trình theo ẩn x");
    expect(cleanFormat("")).toBe("");
  });
});

describe("stepFormat / stepExample", () => {
  const base = problemSchema.parse({
    id: "T1", title: "t", statement: "Giải hệ x + y = 5, x - y = 1.", solution: { x: 3, y: 2 },
    solution_steps: ["Cộng hai vế: 2x = 6.", "Vậy x = 3, y = 2."], hints: [1, 2, 3].map((level) => ({ level, text: "g" })),
    step_formats: ["một phương trình sau khi cộng hai vế", "câu kết luận nghiệm"], step_examples: ["a + b = 7", "x = 99"],
  });
  it("trả đúng bước", () => { expect(stepFormat(base, 0)).toContain("cộng hai vế"); expect(stepExample(base, 0)).toBe("a + b = 7"); });
  it("lệch số bước thì không dùng", () => { expect(stepFormat({ ...base, step_formats: ["một"] }, 0)).toBe(""); });
  it("đề cũ chưa có thì rỗng", () => { const { step_formats, step_examples, ...rest } = base; void step_formats; void step_examples; expect(stepFormat(problemSchema.parse(rest), 0)).toBe(""); });
  it("chặn ví dụ lộ kết quả của đề", () => { expect(stepExample({ ...base, step_examples: ["x = 3", "y = 2"] }, 1)).toBe(""); });
});

describe("ladder: lượt gần đúng không đẩy học sinh tới màn hiện lời giải", () => {
  it("near không tăng stall, kể cả khi đã hết gợi ý", () => {
    expect(ladder("steps", 3, 4, false, true)).toEqual({ stall: 4, reveal: false });
  });
  it("lượt sai thường vẫn tăng stall và hiện lời giải ở lượt thứ 5", () => {
    expect(ladder("steps", 3, 4, false)).toEqual({ stall: 5, reveal: true });
    expect(ladder("steps", 3, 4, false, false).reveal).toBe(true);
  });
  it("qua bước thì về 0", () => { expect(ladder("steps", 3, 4, true, true)).toEqual({ stall: 0, reveal: false }); });
});

describe("lac_de: nói chuyện ngoài bài", () => {
  it("không kèm dạng cần viết, có nhắc việc cần làm", () => {
    const r = scenarioReply("lac_de", step);
    expect(r).toContain("Việc cần làm ở bước 1/8");
    expect(r).not.toContain("viết ra");
  });
});
