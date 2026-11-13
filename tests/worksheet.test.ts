import { describe, expect, it, vi } from "vitest";
import { gradeWorksheet, wsScore, type AiVerdict, type Judge } from "../lib/worksheet/grade";
import { wsAnswer, wsHint, wsView } from "../lib/worksheet/view";
import { problemSchema } from "../lib/schema/problem";

// Chế độ "làm theo bước rồi nộp cả bài": chấm từng bước độc lập, bước đúng được giữ, bước sai báo đúng bước đó; AI giả (judge) để không gọi mạng.
const prob = problemSchema.parse({
  id: "T", title: "t", statement: "Tính A rồi B rồi C với số 3 và 4.", solution: { c: 15 },
  solution_steps: ["Tính $A = 3 + 4 = 7$.", "Tính $B = 7 \\times 2 = 14$.", "Vậy $C = 14 + 1 = 15$."],
  step_goals: ["Tính A từ hai số đề cho", "Tính B từ A", "Tính C từ B"],
  step_hints: [["Nhìn hai số đề cho.", "Dùng phép cộng.", "Cộng hai số."], ["Nhìn A.", "Dùng phép nhân.", "Nhân A với hệ số."], ["Nhìn B.", "Dùng phép cộng.", "Cộng 1."]],
  step_checks: [{ result: "7", accepts: [] }, { result: "14", accepts: [] }, { result: "15", accepts: [] }],
  error_traps: [{ step: 2, wrong: "10", why: "Bước này nhân A với 2, không phải cộng." }],
  hints: [1, 2, 3].map((level) => ({ level, text: "Đọc lại đề." })),
});

const never: Judge = vi.fn(async () => { throw new Error("không được gọi AI"); });
const fake = (v: Partial<AiVerdict>[]): Judge => vi.fn(async (_k: string, ids: number[]) => ids.map((id) => ({ step: id, verdict: "đủ" as const, evidence: "", note: "", ...(v.find((x) => x.step === id) ?? {}) })));

describe("gradeWorksheet: luật server, không gọi AI", () => {
  it("con số trơn khớp kết quả chuẩn là đúng, không gọi AI", async () => {
    const r = await gradeWorksheet(prob, ["7", "14", "15"], 0, never);
    expect(r.map((x) => x.ok)).toEqual([true, true, true]);
    expect(never).not.toHaveBeenCalled();
  });

  it("sai bước nào chỉ báo bước đó, các bước đúng vẫn đúng (chép nhầm từ nháp)", async () => {
    const r = await gradeWorksheet(prob, ["7", "9", "15"], 0, never);
    expect(r.map((x) => x.ok)).toEqual([true, false, true]);
    expect(r[1].note).toMatch(/9 chưa khớp/);
  });

  it("kết quả sai đã biết (error_traps) trả lời giải thích lỗi AI viết sẵn", async () => {
    const r = await gradeWorksheet(prob, ["7", "10", "15"], 0, never);
    expect(r[1]).toMatchObject({ step: 1, ok: false, note: "Bước này nhân A với 2, không phải cộng." });
  });

  it("lời giải thích lỗi xưng 'Học sinh' được đổi sang 'bạn' khi hiện cho học sinh", async () => {
    const p2 = problemSchema.parse({ ...prob, error_traps: [{ step: 2, wrong: "10", why: "Học sinh cộng thay vì nhân A với 2." }] });
    const r = await gradeWorksheet(p2, ["7", "10", "15"], 0, never);
    expect(r[1].note).toBe("Bạn cộng thay vì nhân A với 2.");
  });

  it("bước đã khóa (đúng ở lần nộp trước) không chấm lại, kể cả khi đáp án gửi lên đã bị đổi", async () => {
    const r = await gradeWorksheet(prob, ["999", "14", "15"], 0b001, never);
    expect(r.map((x) => x.step)).toEqual([1, 2]);
    expect(r.every((x) => x.ok)).toBe(true);
  });

  it("ô trống thì báo bước đó chưa có đáp án", async () => {
    const r = await gradeWorksheet(prob, ["7", "", "15"], 0, never);
    expect(r[1]).toMatchObject({ ok: false });
    expect(r[1].note).toMatch(/chưa có đáp án/);
  });

  it("phép tính sai trong lời giải bị bắt ở tầng luật, nêu đúng phép đó", async () => {
    const r = await gradeWorksheet(prob, ["3 + 4 = 8", "14", "15"], 0, never);
    expect(r[0].ok).toBe(false);
    expect(r[0].note).toContain("3 + 4 = 8");
  });
});

describe("gradeWorksheet: một lần gọi AI gộp mọi bước cần AI", () => {
  it("lời giải đầy đủ có cách làm: số khớp thì đúng khi AI không bác, chỉ MỘT lượt gọi", async () => {
    const j = fake([]);
    const r = await gradeWorksheet(prob, ["A = 3 + 4 = 7", "B = 7 × 2 = 14", "C = 14 + 1 = 15"], 0, j);
    expect(r.every((x) => x.ok)).toBe(true);
    expect(j).toHaveBeenCalledTimes(1);
    expect(vi.mocked(j).mock.calls[0][1]).toEqual([0, 1, 2]);
  });

  it("AI bác bước có số khớp thì model mạnh xác nhận; không đồng ý thì coi là đúng (không bác oan)", async () => {
    const j: Judge = vi.fn(async (kind: string, ids: number[]) => ids.map((id) => ({ step: id, verdict: kind === "first" ? ("sai" as const) : ("đủ" as const), evidence: "", note: "" })));
    const r = await gradeWorksheet(prob, ["A = 3 + 4 = 7", "14", "15"], 0, j);
    expect(r[0].ok).toBe(true);
    expect(j).toHaveBeenCalledTimes(2);
    expect(vi.mocked(j).mock.calls[1][0]).toBe("confirm");
  });

  it("AI bác và model mạnh cũng bác: sai, lời nhắc không lộ kết quả bước", async () => {
    const j: Judge = vi.fn(async (kind: string, ids: number[]) => ids.map((id) => ({ step: id, verdict: "sai" as const, evidence: "", note: kind === "first" ? "Bạn cộng hai số của đề chưa khớp việc của bước." : "Kết quả đúng là 7 nhé." })));
    const r = await gradeWorksheet(prob, ["A = 3 + 4 = 7", "14", "15"], 0, j);
    expect(r[0].ok).toBe(false);
    expect(r[0].note).not.toMatch(/\b7\b/);
    expect(r[0].note.length).toBeGreaterThan(10); // dùng câu mẫu khi câu AI bị loại
  });

  it("số chưa khớp: AI không thể biến thành đúng, dù trả verdict đủ", async () => {
    const r = await gradeWorksheet(prob, ["A = 3 + 5 = 8", "14", "15"], 0, fake([{ step: 0, verdict: "đủ" }]));
    expect(r[0].ok).toBe(false);
  });

  it("bước viết hệ có dạng chữ chuẩn: viết bằng chữ thường (không LaTeX) vẫn đúng khi AI duyệt có trích dẫn thật", async () => {
    const sys = problemSchema.parse({ ...prob, solution: { x: 9 }, solution_steps: ["Lập hệ $\\begin{cases} 3x + 2y = 41 \\\\ 2x + 4y = 46 \\end{cases}$.", "Vậy $x = 9$."], step_checks: [{ result: "\\begin{cases} 3x + 2y = 41 \\\\ 2x + 4y = 46 \\end{cases}", accepts: [] }, { result: "x = 9", accepts: [] }], error_traps: [] });
    const ans = "3x + 2y = 41 và 2x + 4y = 46";
    const ok = await gradeWorksheet(sys, [ans, "x = 9"], 0, fake([{ step: 0, verdict: "đủ", evidence: ans }]));
    expect(ok[0].ok).toBe(true);
    const fakeEv = await gradeWorksheet(sys, [ans, "x = 9"], 0, fake([{ step: 0, verdict: "đủ", evidence: "hệ phương trình bậc nhất hai ẩn" }])); // trích dẫn không có thật: không nhận
    expect(fakeEv[0].ok).toBe(false);
    const no = await gradeWorksheet(sys, ["3x + 2y = 41", "x = 9"], 0, fake([{ step: 0, verdict: "thiếu", note: "Bạn mới viết một phương trình, còn thiếu phương trình thứ hai." }]));
    expect(no[0]).toMatchObject({ ok: false, note: "Bạn mới viết một phương trình, còn thiếu phương trình thứ hai." });
  });

  it("bước chỉ AI phán được mà model nhanh bác: hỏi lại model mạnh, mạnh duyệt đủ thì nhận (không kẹt oan)", async () => {
    const free = problemSchema.parse({ ...prob, solution_steps: ["Gọi $x$ là ẩn cần tìm.", "Tính $B = 14$.", "Vậy $C = 15$."], step_checks: [{ result: "", accepts: [] }, { result: "14", accepts: [] }, { result: "15", accepts: [] }] });
    const ans = "Gọi x là số cần tìm";
    const j: Judge = vi.fn(async (kind: string, ids: number[]) => ids.map((id) => ({ step: id, verdict: kind === "first" ? ("thiếu" as const) : ("đủ" as const), evidence: kind === "first" ? "" : ans, note: "Bạn thiếu đơn vị." })));
    const r = await gradeWorksheet(free, [ans, "14", "15"], 0, j);
    expect(r[0].ok).toBe(true);
    expect(vi.mocked(j).mock.calls.map((c) => c[0])).toEqual(["first", "confirm"]);
  });

  it("lời nhắc AI nêu số trong lời giải của bước (kể cả bước không có số chuẩn) bị loại, dùng câu mẫu", async () => {
    const sys = problemSchema.parse({ ...prob, solution: { x: 9 }, solution_steps: ["Nhân hai vế với 3 ta được $x + 6 = 27$.", "Vậy $x = 9$."], step_checks: [{ result: "", accepts: [] }, { result: "x = 9", accepts: [] }], error_traps: [] });
    const r = await gradeWorksheet(sys, ["x + 2 = 9", "x = 9"], 0, fake([{ step: 0, verdict: "sai", note: "Bạn viết 9 thay vì 27 ở vế phải." }]));
    expect(r[0].ok).toBe(false);
    expect(r[0].note).not.toMatch(/27/);
    expect(r[0].note.length).toBeGreaterThan(10);
  });

  it("lời nhắc AI nói ra đáp án dạng chữ của bước ('vô nghiệm') bị loại", async () => {
    const sys = problemSchema.parse({ ...prob, solution: { kq: "vô nghiệm" }, solution_steps: ["Tính $B = 14$.", "Vậy hệ phương trình vô nghiệm."], step_checks: [{ result: "14", accepts: [] }, { result: "Hệ phương trình vô nghiệm", accepts: ["vô nghiệm"] }], error_traps: [] });
    const r = await gradeWorksheet(sys, ["14", "Hệ có một nghiệm duy nhất"], 0, fake([{ step: 1, verdict: "sai", note: "Bạn kết luận chưa khớp vì ở bước trước hệ phương trình vô nghiệm." }]));
    const s2 = r.find((x) => x.step === 1)!;
    expect(s2.ok).toBe(false);
    expect(s2.note).not.toMatch(/vô nghiệm/);
    expect(s2.note.length).toBeGreaterThan(10);
  });

  it("lời nhắc AI xưng 'Học sinh' được đổi sang 'bạn'", async () => {
    const r = await gradeWorksheet(prob, ["A = 3 + 5 = 8", "14", "15"], 0, fake([{ step: 0, verdict: "sai", note: "Học sinh cộng hai số của đề chưa khớp việc của bước." }]));
    expect(r[0].note).toBe("Bạn cộng hai số của đề chưa khớp việc của bước.");
    const low = await gradeWorksheet(prob, ["A = 3 + 5 = 8", "14", "15"], 0, fake([{ step: 0, verdict: "sai", note: "học sinh cộng hai số của đề chưa khớp việc của bước." }]));
    expect(low[0].note).toBe("Bạn cộng hai số của đề chưa khớp việc của bước."); // viết hoa đầu câu
  });

  it("AI lỗi: bước số khớp vẫn được ghi nhận; bước không có số chuẩn để nộp lại, không tính là sai", async () => {
    const free = problemSchema.parse({ ...prob, solution_steps: ["Gọi $x$ là ẩn cần tìm.", "Tính $B = 14$.", "Vậy $C = 15$."], step_checks: [{ result: "", accepts: [] }, { result: "14", accepts: [] }, { result: "15", accepts: [] }] });
    const down: Judge = vi.fn(async () => null);
    const r = await gradeWorksheet(free, ["Gọi x là số cần tìm", "B = 7 × 2 = 14", "15"], 0, down);
    expect(r[1].ok).toBe(true);
    expect(r[0]).toMatchObject({ ok: false, unjudged: true });
  });
});

describe("gradeWorksheet: kiểu nhập cả bài (một ô)", () => {
  const all = (t: string) => [t, t, t];
  const txt = "A = 3 + 4 = 7\nB = 7 × 2 = 14\nC = 14 + 1 = 15";

  it("đủ các bước trong một ô: tất cả đúng, MỘT lượt gọi AI, văn bản gửi một lần", async () => {
    const j = fake([]);
    const r = await gradeWorksheet(prob, all(txt), 0, j, true);
    expect(r.map((x) => x.ok)).toEqual([true, true, true]);
    expect(j).toHaveBeenCalledTimes(1);
  });

  it("số khớp nhưng AI không duyệt đủ: model mạnh xác nhận, vẫn không duyệt thì báo bước đó", async () => {
    const j: Judge = vi.fn(async (_k: string, ids: number[]) => ids.map((id) => ({ step: id, verdict: id === 2 ? ("chưa làm" as const) : ("đủ" as const), evidence: "", note: "" })));
    const r = await gradeWorksheet(prob, all("A = 3 + 4 = 7\nB = 7 × 2 = 14\nĐáp số 15"), 0, j, true);
    expect(r.map((x) => x.ok)).toEqual([true, true, false]);
    expect(vi.mocked(j).mock.calls[1][0]).toBe("confirm");
    expect(vi.mocked(j).mock.calls[1][1]).toEqual([2]);
  });

  it("thiếu một bước: số bước đó không có trong bài thì chỉ báo bước đó", async () => {
    const r = await gradeWorksheet(prob, all("A = 3 + 4 = 7\nB = 7 × 2 = 14"), 0, fake([{ step: 2, verdict: "chưa làm" }]), true);
    expect(r.map((x) => x.ok)).toEqual([true, true, false]);
  });

  it("phép sai ở giữa bài không làm mất bằng chứng của bước sau (không cắt bài)", async () => {
    const r = await gradeWorksheet(prob, all("A = 3 + 4 = 7\nB = 7 × 2 = 15\nC = 14 + 1 = 15"), 0, fake([]), true);
    expect(r[0].ok).toBe(true);
    expect(r[2].ok).toBe(true);
  });

  it("dòng sai của bước khác không bị gán nhầm cho bước chưa khớp: để AI phán, AI thấy đủ bài", async () => {
    const j = fake([]);
    const r = await gradeWorksheet(prob, all("A = 3 + 4 = 7\nB = 7 × 2 = 15\nĐáp số 15"), 0b001, j, true);
    expect(r.find((x) => x.step === 1)?.note ?? "").not.toContain("15");
    expect(j).toHaveBeenCalled();
    expect(vi.mocked(j).mock.calls[0][2][1]).toContain("7 × 2 = 15");
  });

  it("bước đã khóa không chấm lại; con số trơn không tắt bằng luật (cần AI)", async () => {
    const j = fake([]);
    const r = await gradeWorksheet(prob, all("15"), 0b011, j, true);
    expect(r.map((x) => x.step)).toEqual([2]);
    expect(j).toHaveBeenCalledTimes(1);
  });
});

describe("wsScore: xem đáp án thì bước đó 0 điểm", () => {
  it("đúng hết, không xem đáp án: điểm tối đa", () => expect(wsScore(3, 0b111, 0)).toMatchObject({ own: 3, total: 12, finalCorrect: true }));
  it("xem đáp án bước nào, bước đó không tính dù chép đúng", () => {
    const s = wsScore(3, 0b111, 0b010);
    expect(s.own).toBe(2);
    expect(s.total).toBeLessThan(12);
  });
  it("xem đáp án bước kết luận thì không phải tự đi tới kết luận đúng", () => expect(wsScore(3, 0b111, 0b100).finalCorrect).toBe(false));
  it("xem đáp án 1 bước trong bài 8 bước vẫn bị trừ điểm (không bị làm tròn che mất)", () => {
    const s = wsScore(8, 0b11111111, 0b00010000);
    expect(s.own).toBe(7);
    expect(s.total).toBeLessThan(12);
    expect(s.identify + s.plan + s.calculate + s.explain).toBe(s.total);
    expect([s.identify, s.plan, s.calculate, s.explain].every((x) => x >= 0 && x <= 3)).toBe(true);
  });
  it("xem đáp án cả bài thì 0 điểm", () => expect(wsScore(3, 0b111, 0b111).total).toBe(0));
});

describe("worksheet view: không lộ đáp án xuống trình duyệt", () => {
  it("dữ liệu gửi xuống chỉ có việc cần làm của từng bước, không có kết quả chuẩn", () => {
    const v = wsView(prob);
    expect(v.steps).toHaveLength(3);
    expect(JSON.stringify(v)).not.toMatch(/"solution"|step_checks|\b15\b/);
  });
  it("gợi ý theo mức lấy đúng mức của bước; đáp án chỉ lấy khi gọi riêng", () => {
    expect(wsHint(prob, 1, 2)).toBe("Dùng phép nhân.");
    expect(wsAnswer(prob, 2)).toContain("15");
  });
});

describe("gradeWorksheet: học sinh viết gọn, bỏ bước trung gian (ca HP01 bước 3)", () => {
  const hp = problemSchema.parse({
    id: "HP", title: "Hệ thế", statement: "Giải hệ $x + 2y = 7$, $3x - y = 7$.", solution: { x: "$3$", y: "$2$" },
    solution_steps: ["Biểu diễn $x = 7 - 2y$.", "Thế vào: $3(7 - 2y) - y = 7$.", "Giải phương trình ẩn $y$, khai triển và rút gọn thành $21 - 6y - y = 7$, tương đương $-7y = -14$, từ đó tính được $y = 2$."],
    step_goals: ["Rút x", "Thế", "Giải y"],
    step_hints: [["a.", "b.", "c."], ["a.", "b.", "c."], ["a.", "b.", "c."]],
    step_checks: [{ result: "x = 7 - 2y", accepts: [] }, { result: "3(7 - 2y) - y = 7", accepts: [] }, { result: "y = 2", accepts: ["y=2"] }],
    hints: [1, 2, 3].map((level) => ({ level, text: "Đọc lại đề." })),
  });
  const ans = ["x = 7 - 2y", "3(7 - 2y) - y = 7", "21-7y=7\ny=2"];

  it("xuống dòng không làm 'y=2' dính thành '7y=2': khớp dạng chuẩn, AI không bác thì đúng", async () => {
    const r = await gradeWorksheet(hp, ans, 0b011, fake([]));
    expect(r).toMatchObject([{ step: 2, ok: true }]);
  });

  it("AI bác 'sai' chung chung (không nêu được lỗi) thì không bác oan bước đã khớp", async () => {
    const j: Judge = vi.fn(async (_k: string, ids: number[]) => ids.map((id) => ({ step: id, verdict: "sai" as const, evidence: "", note: "" })));
    const r = await gradeWorksheet(hp, ans, 0b011, j);
    expect(r[0].ok).toBe(true);
  });

  it("vẫn không khớp khi 'y=2' thật sự là hệ số dính liền (7y=2)", async () => {
    const r = await gradeWorksheet(hp, ["x = 7 - 2y", "3(7 - 2y) - y = 7", "7y=2"], 0b011, fake([{ step: 2, verdict: "thiếu" }]));
    expect(r[0].ok).toBe(false);
  });
});

describe("gradeWorksheet: cả bài, học sinh viết gọn (ca HP01 bước 3)", () => {
  const hp = problemSchema.parse({
    id: "HP", title: "Hệ thế", statement: "Giải hệ $x + 2y = 7$, $3x - y = 7$.", solution: { x: "$3$", y: "$2$" },
    solution_steps: ["Biểu diễn $x = 7 - 2y$.", "Thế vào: $3(7 - 2y) - y = 7$.", "Giải phương trình ẩn $y$, khai triển và rút gọn thành $21 - 6y - y = 7$, tương đương $-7y = -14$, từ đó tính được $y = 2$."],
    step_goals: ["Rút x", "Thế", "Giải y"],
    step_hints: [["a.", "b.", "c."], ["a.", "b.", "c."], ["a.", "b.", "c."]],
    step_checks: [{ result: "x = 7 - 2y", accepts: [] }, { result: "3(7 - 2y) - y = 7", accepts: [] }, { result: "y = 2", accepts: ["y=2"] }],
    hints: [1, 2, 3].map((level) => ({ level, text: "Đọc lại đề." })),
  });
  const bai = "x = 7 - 2y\n3(7 - 2y) - y = 7\n21-7y=7\ny=2";

  it("AI duyệt đủ thì bước 3 đúng", async () => {
    const r = await gradeWorksheet(hp, [bai, bai, bai], 0b011, fake([]), true);
    expect(r).toMatchObject([{ step: 2, ok: true }]);
  });

  it("AI chỉ nói 'sai' chung chung (số đã khớp) thì không bác oan", async () => {
    const j: Judge = vi.fn(async (_k: string, ids: number[]) => ids.map((id) => ({ step: id, verdict: "sai" as const, evidence: "", note: "" })));
    const r = await gradeWorksheet(hp, [bai, bai, bai], 0b011, j, true);
    expect(r[0].ok).toBe(true);
  });
});
