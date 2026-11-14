import { describe, expect, it } from "vitest";
import { SCENARIOS, scenarioReply, withAiLine } from "../lib/chat/scenarios";
import { ladder } from "../lib/chat/assist";

describe("scenarioReply: câu mẫu do server ghép theo kịch bản", () => {
  it("không nêu số thứ tự bước hay việc cần làm ở bước nào", () => {
    for (const sc of SCENARIOS) for (const tries of [1, 2, 3, 6]) for (let i = 0; i < 8; i++) expect(scenarioReply(sc, tries), sc).not.toMatch(/bước|Việc cần làm|\d\/\d/i);
  });
  it("từ lần 3 trỏ nút Gợi ý (trừ hỏi lại, xin đáp án, lạc đề)", () => {
    expect(scenarioReply("sai_so", 2)).not.toContain("Gợi ý");
    expect(scenarioReply("sai_so", 3)).toContain("bấm Gợi ý");
    expect(scenarioReply("lac_de", 5)).not.toContain("Nếu bí");
  });
  it("không khen ở mọi kịch bản (phân loại có thể sai)", () => {
    for (const sc of SCENARIOS) for (let i = 0; i < 12; i++) expect(scenarioReply(sc, 1), sc).not.toMatch(/ổn|đúng rồi|tốt|giỏi|chính xác|gần đúng|gần được/i);
  });
  it("không lặp lại đúng câu dẫn của lượt trước", () => {
    const first = scenarioReply("dang_do", 1);
    for (let i = 0; i < 20; i++) expect(scenarioReply("dang_do", 1, first)).not.toBe(first);
  });
});

describe("withAiLine: câu AI nhắc đúng điều học sinh viết", () => {
  it("câu AI đứng một mình ở lần 1-2, từ lần 3 thêm trỏ nút Gợi ý", () => {
    for (const sc of ["sai_so", "dung_huong_thieu", "sai_phuong_phap", "thieu_dau_bang", "khong_lien_quan", "chua_lam"] as const)
      for (const tries of [1, 2]) expect(withAiLine(sc, "Vế phải của phương trình đầu chưa khớp", tries)).toBe("Vế phải của phương trình đầu chưa khớp.");
    expect(withAiLine("sai_so", "Vế phải chưa khớp.", 3)).toBe("Vế phải chưa khớp. Nếu bí, bạn bấm Gợi ý nhé.");
  });
});

describe("ladder: lượt gần đúng không đẩy học sinh tới màn hiện lời giải", () => {
  it("near không tăng stall, kể cả khi đã hết gợi ý", () => {
    expect(ladder("steps", 3, 4, false, true)).toEqual({ stall: 4, reveal: false });
  });
  it("lượt sai thường vẫn tăng stall và hiện lời giải ở lượt thứ 5", () => {
    expect(ladder("steps", 3, 4, false)).toEqual({ stall: 5, reveal: true });
    expect(ladder("steps", 3, 4, false, false).reveal).toBe(true);
  });
  it("tiến thêm mốc thì về 0", () => { expect(ladder("steps", 3, 4, true, true)).toEqual({ stall: 0, reveal: false }); });
});
