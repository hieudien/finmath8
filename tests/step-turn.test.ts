import { beforeEach, describe, expect, it, vi } from "vitest";

// Test tích hợp stepTurn: mock DB và AI, kiểm các nhánh dễ hỏng (nhảy cóc, vetted, near/trần, hiện lời giải).
const updates: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  admin: () => ({
    from: (table: string) => ({
      insert: () => Promise.resolve({ error: null }),
      update: (o: Record<string, unknown>) => ({ eq: () => { if (table === "chat_sessions") updates.push(o); return Promise.resolve({ error: null }); } }),
    }),
  }),
}));
vi.mock("@/lib/db", () => ({ check: (x: unknown) => x }));
vi.mock("@/lib/log", () => ({ log: vi.fn(async () => undefined) }));
vi.mock("@/lib/errors", () => ({ reportError: vi.fn(async () => undefined), swallow: () => () => undefined }));
vi.mock("next/server", () => ({ after: () => undefined }));
vi.mock("@/lib/llm", () => ({ askJson: vi.fn(), askText: vi.fn() }));
vi.mock("@/lib/chat/engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/chat/engine")>()),
  botMsg: vi.fn(async () => ({ error: null })),
  finish: vi.fn(async () => undefined),
  withReview: vi.fn(async (_c: unknown, _s: unknown, _p: unknown, _t: unknown, _r: unknown, reply: string) => reply),
}));

import { askJson } from "../lib/llm";
import { RESULT_EXPLAIN, stepAsk, stepHint, stepTurn } from "../lib/chat/steps";
import { claimNote } from "../lib/chat/arith";
import { problemSchema } from "../lib/schema/problem";
import type { Session, Msg } from "../lib/chat/engine";

const prob = problemSchema.parse({
  id: "T", title: "t", statement: "Tính A rồi B rồi C với số 3 và 4.", solution: { c: 15 },
  solution_steps: ["Tính $A = 3 + 4 = 7$.", "Tính $B = 7 \\times 2 = 14$.", "Vậy $C = 14 + 1 = 15$."],
  step_goals: ["Tính A từ hai số đề cho", "Tính B từ A", "Tính C từ B"],
  step_hints: [["Nhìn hai số đề cho.", "Dùng phép cộng.", "Cộng hai số."], ["Nhìn A.", "Dùng phép nhân.", "Nhân A với hệ số."], ["Nhìn B.", "Dùng phép cộng.", "Cộng 1."]],
  step_checks: [{ result: "7", accepts: [] }, { result: "14", accepts: [] }, { result: "15", accepts: [] }],
  hints: [1, 2, 3].map((level) => ({ level, text: "g" })),
});
const cfg = { provider: "gemini" as const, key: "k", model: "m", temperature: 0 };
const sess = (o: Partial<Session> = {}): Session => ({ id: "s1", link_id: "l1", anon_id: "a1", step: 1, hint_level: 0, progress: 0, stall: 0, revealed: 0, struggled: 0, started_at: "", status: "active", mode: "steps", ...o });
const ai = (o: { verdict?: string; scenario?: string; reply?: string; evidence?: string }) => vi.mocked(askJson).mockResolvedValue({ verdict: "chưa làm", scenario: "chua_lam", reply: "", evidence: "", ...o } as never);
const run = (text: string, s = sess(), all: Msg[] = []) => stepTurn(cfg, s, prob, text, "t1", all);
const lastUpdate = () => updates.at(-1) as { stall?: number; progress?: number } | undefined;

beforeEach(() => { updates.length = 0; vi.mocked(askJson).mockReset(); });

describe("stepTurn: nhảy cóc", () => {
  it("nộp kết quả bước 2 khi đang ở bước 1: bot bắt làm đúng thứ tự dù AI trả câu kịch bản", async () => {
    ai({ verdict: "sai", scenario: "khong_lien_quan", reply: "Phần này chưa xuất phát từ đề" });
    const r = await run("kết quả là 14");
    expect(r.reply).toMatch(/chưa thấy cách làm các phần trước/);
    expect(r.reply).not.toMatch(/bước 1\/3/i);
    expect(lastUpdate()?.progress).toBe(0);
  });
});

describe("stepTurn: câu AI qua rào hoặc rơi về câu mẫu", () => {
  it("câu AI hợp lệ được dùng nguyên", async () => {
    ai({ verdict: "thiếu", scenario: "dung_huong_thieu", reply: "Bạn mới viết một vế của phép tính" });
    const r = await run("3 +");
    expect(r.reply).toContain("Bạn mới viết một vế của phép tính.");
  });
  it("câu AI có lời khen khi chưa đạt: bỏ, dùng câu mẫu", async () => {
    ai({ verdict: "sai", scenario: "sai_so", reply: "Bạn làm rất tuyệt vời nhé" });
    const r = await run("3 + 5");
    expect(r.reply).not.toContain("tuyệt");
    expect(r.reply).toMatch(/chưa khớp/);
  });
  it("câu AI lộ kết quả của bước hiện tại: bỏ, dùng câu mẫu", async () => {
    ai({ verdict: "sai", scenario: "sai_so", reply: "Kết quả phải là 7 nhé bạn" });
    const r = await run("3 + 5");
    expect(r.reply).not.toContain("7");
  });
  it("verdict đủ nhưng không có bằng chứng thật: không ghi nhận bước, không dùng lời xác nhận của AI", async () => {
    ai({ verdict: "đủ", scenario: "chua_lam", reply: "Chính xác rồi", evidence: "không có trong tin" });
    const r = await run("hình như là bảy");
    expect(lastUpdate()?.progress).toBe(0);
    expect(r.reply).not.toContain("Chính xác");
  });
  it("câu AI có dấu hỏi bị bỏ", async () => {
    ai({ verdict: "sai", scenario: "sai_so", reply: "Bạn tính lại được không?" });
    const r = await run("3 + 5");
    expect(r.reply).not.toContain("được không");
  });
});

describe("stepTurn: bậc thang kẹt và near", () => {
  const exhausted = { hint_level: 3, stall: 4 }; // đã hết gợi ý, thêm một lượt kẹt nữa là hiện lời giải
  it("lượt gần đúng (dung_huong_thieu) không tính kẹt: không hiện lời giải", async () => {
    ai({ verdict: "thiếu", scenario: "dung_huong_thieu", reply: "Bạn mới viết một vế" });
    const r = await run("3 +", sess(exhausted));
    expect(r.reply).not.toContain("A = 3 + 4 = 7");
    expect(lastUpdate()?.stall).toBe(4);
    expect(lastUpdate()?.progress).toBe(0);
  });
  it("lượt sai thường tính kẹt: đủ lượt thì hiện lời giải bước và ghi tiến độ", async () => {
    ai({ verdict: "sai", scenario: "sai_phuong_phap", reply: "Cách này chưa phù hợp" });
    const r = await run("3 x 4", sess(exhausted));
    expect(r.reply).toContain("A = 3 + 4 = 7"); // hiện lời giải của phần chưa làm đầu tiên
    expect(r.reply).not.toMatch(/bước 1\/3/i);
    expect(r.reply).toMatch(/gõ lại/); // hiện lời giải nhưng chưa tính xong: học sinh phải tự gõ lại
    expect(lastUpdate()?.progress).toBe(0);
    expect((lastUpdate() as { revealed?: number }).revealed).toBe(1);
  });
  it("gần đúng quá 6 lần ở một bước thì cũng tính kẹt (có trần)", async () => {
    ai({ verdict: "thiếu", scenario: "dung_huong_thieu", reply: "Bạn mới viết một vế" });
    const all: Msg[] = [{ role: "bot", content: "Chào bạn", hint_level: 0, meta: { kind: "open" } }, ...Array.from({ length: 7 }, () => ({ role: "student" as const, content: "3 +", hint_level: null }))];
    const r = await run("3 +", sess(exhausted), all);
    expect(r.reply).toContain("A = 3 + 4 = 7");
  });
});

describe("stepTurn: qua bước", () => {
  it("kết quả đúng của bước hiện tại được ghi nhận, mời viết tiếp mà không nêu bước kế", async () => {
    ai({});
    const r = await run("A = 3 + 4 = 7");
    expect(lastUpdate()?.progress).toBe(1);
    expect(r.reply).toMatch(/viết tiếp/);
    expect(r.reply).not.toMatch(/Bước \d/);
  });
});

describe("stepTurn: học sinh giỏi nộp gộp nhiều bước", () => {
  it("lời giải có kết quả của bước 1 và 2: ghi nhận cả hai trong một lượt, chỉ gọi một lần soát lỗi bằng model rẻ", async () => {
    vi.mocked(askJson).mockResolvedValue({ steps: [] } as never);
    const r = await run("$A = 3 + 4 = 7$ và $B = 7 \times 2 = 14$");
    expect(vi.mocked(askJson)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(askJson).mock.calls[0][0].model).toBe("gemini-3.5-flash-lite");
    expect(lastUpdate()?.progress).toBe(0b011);
    expect(r.reply).toMatch(/ghi nhận phần bạn vừa làm/);
    expect(r.reply).toMatch(/viết tiếp/);
    expect(r.reply).not.toMatch(/Bước \d/);
  });
  it("đáp án trơn (chỉ kết quả cuối): không ghi nhận, bắt viết cách làm", async () => {
    ai({ verdict: "chưa làm", scenario: "chua_lam" });
    const r = await run("C = 15");
    expect(lastUpdate()?.progress).toBe(0);
    expect(r.reply).toMatch(/chưa thấy cách làm/);
  });
  it("cả lời giải có bước không có số: một lần gọi AI duyệt gộp, bằng chứng thật thì ghi nhận hết", async () => {
    const p2 = problemSchema.parse({
      id: "T2", title: "t", statement: "Tính C với số 3 và 4.", solution: { c: 15 },
      solution_steps: ["Gọi $n$ là số cần tìm.", "Tính $B = 7 \times 2 = 14$.", "Vậy $C = 14 + 1 = 15$."],
      step_checks: [{ result: "", accepts: [] }, { result: "14", accepts: [] }, { result: "15", accepts: [] }],
      hints: [1, 2, 3].map((level) => ({ level, text: "g" })),
    });
    vi.mocked(askJson).mockResolvedValue({ steps: [{ step: 1, verdict: "đủ", evidence: "Gọi $n$ là số cần tìm." }] } as never);
    const r = await stepTurn(cfg, sess(), p2, "Gọi $n$ là số cần tìm.\n$B = 7 \times 2 = 14$.\nVậy $C = 14 + 1 = 15$.", "t1", []);
    expect(vi.mocked(askJson)).toHaveBeenCalledTimes(2); // duyệt gộp + soát lỗi các bước số
    expect(lastUpdate()?.progress).toBe(0b111);
    expect(r.done).toBe(true);
  });
});

describe("stepTurn: kiểm tra kỹ từng bước", () => {
  it("tầng 0: phép so sánh đảo chiều bị chặn, các dòng đúng vẫn được ghi nhận", async () => {
    vi.mocked(askJson).mockResolvedValue({ steps: [] } as never);
    const r = await run("A = 3 + 4 = 7\nB = 7 x 2 = 14\n14 > 15");
    expect(lastUpdate()?.progress).toBe(0b011);
    expect(r.reply).toContain('"14 > 15" chưa đúng');
  });
  it("tầng 0: phép tính sai số học không qua bước, không gọi AI", async () => {
    const r = await run("A = 3 + 4 = 8");
    expect(vi.mocked(askJson)).not.toHaveBeenCalled();
    expect(lastUpdate()?.progress).toBe(0);
    expect(r.reply).toContain("chưa khớp"); // đẳng thức sai: báo lỗi kết quả, không nói phép tính sai
    expect(r.reply).toContain("kết quả");
  });
  it("hỏi 'chưa đúng chỗ nào' ngay sau khi bị báo kết quả không khớp: câu cố định, không gọi AI, không nêu số", async () => {
    const all: Msg[] = [{ role: "student", content: "(12 + 8) × 2 = 41", hint_level: null }, { role: "bot", content: claimNote("(12 + 8) × 2 = 41"), hint_level: 0, meta: { kind: "wrong" } }];
    const r = await stepAsk(cfg, sess(), prob, "chưa đúng chỗ nào?", "t1", all);
    expect(vi.mocked(askJson)).not.toHaveBeenCalled();
    expect(r.reply).toBe(RESULT_EXPLAIN);
  });
  it("viết phép tính bằng chữ ('nhân') mà kết quả sai: server bắt, không gọi AI, báo lỗi kết quả", async () => {
    const r = await run("chu vi = (12 + 8) nhân 2 = 41");
    expect(vi.mocked(askJson)).not.toHaveBeenCalled();
    expect(r.reply).toContain("kết quả sau dấu =");
    expect(r.reply).not.toMatch(/phép đó/);
  });
  it("soát lỗi: model rẻ báo sai, model chính xác nhận thì bác bước, giữ các bước trước", async () => {
    vi.mocked(askJson).mockResolvedValue({ steps: [{ step: 2, verdict: "sai" }] } as never);
    const r = await run("A = 3 + 4 = 7\nB = 7 x 2 = 14");
    expect(vi.mocked(askJson)).toHaveBeenCalledTimes(2);
    expect(lastUpdate()?.progress).toBe(0b001);
    expect(r.reply).toMatch(/có chỗ chưa đúng/);
    expect(r.reply).not.toMatch(/bước 2\/3/i);
  });
  it("soát lỗi: model rẻ báo sai nhưng model chính không đồng ý thì giữ nguyên", async () => {
    vi.mocked(askJson).mockResolvedValueOnce({ steps: [{ step: 2, verdict: "sai" }] } as never).mockResolvedValueOnce({ steps: [] } as never);
    await run("A = 3 + 4 = 7\nB = 7 x 2 = 14");
    expect(lastUpdate()?.progress).toBe(0b011);
  });
  it("soát lỗi: AI lỗi thì không bác (server đã kiểm số)", async () => {
    vi.mocked(askJson).mockRejectedValue(new Error("AI_SLOW"));
    await run("A = 3 + 4 = 7");
    expect(lastUpdate()?.progress).toBe(1);
  });
});

// Hồi quy phiên TC01: bước kết luận chỉ có dạng chữ ("cửa hàng B").
describe("stepTurn: bước kết luận bằng chữ", () => {
  const shop = problemSchema.parse({
    id: "T3", title: "Chọn cửa hàng", statement: "An mua 30 quyển vở. Cửa hàng A giảm 15%, cửa hàng B giảm 10%. Nên mua ở cửa hàng nào?",
    solution: { a: 275000, b: 270000, best: "B" },
    solution_steps: ["Cửa hàng A phải trả 275000 đồng.", "Cửa hàng B phải trả 270000 đồng.", "Vì số tiền ở B nhỏ hơn nên chọn cửa hàng B."],
    step_goals: ["Tính tiền ở A", "Tính tiền ở B", "So sánh để kết luận"],
    step_hints: [["a", "b", "c"], ["a", "b", "c"], ["a", "b", "c"]],
    step_checks: [{ result: "275000", accepts: [] }, { result: "270000", accepts: [] }, { result: "cửa hàng B", accepts: [] }],
    hints: [1, 2, 3].map((level) => ({ level, text: "g" })),
  });
  const go = (text: string, s = sess()) => stepTurn(cfg, s, shop, text, "t1", []);
  it("nộp gộp, kết luận viết kiểu \"mua ở B\": AI duyệt gộp, ghi nhận cả 3 bước", async () => {
    vi.mocked(askJson).mockResolvedValue({ steps: [{ step: 3, verdict: "đủ", evidence: "mua ở B rẻ hơn do 270000 < 275000" }] } as never);
    const r = await go("tiền ở A là 275000\ntiền ở B là 270000\nmua ở B rẻ hơn do 270000 < 275000");
    expect(lastUpdate()?.progress).toBe(0b111);
    expect(r.done).toBe(true);
  });
  it("mốc kết luận có cả số lẫn chữ (trùng số bước trước, như TC01): vẫn được AI duyệt gộp", async () => {
    const tc = problemSchema.parse({
      id: "T4", title: "Chọn cửa hàng", statement: "An mua 30 quyển vở. Cửa hàng A giảm 15%, cửa hàng B giảm 10%. Nên mua ở cửa hàng nào?",
      solution: { a: 275000, b: 270000, best: "B" },
      solution_steps: ["Cửa hàng A phải trả 275000 đồng.", "Cửa hàng B phải trả 270000 đồng.", "Vì 270000 < 275000 nên chọn cửa hàng B."],
      step_goals: ["Tính tiền ở A", "Tính tiền ở B", "So sánh để kết luận"],
      step_hints: [["a", "b", "c"], ["a", "b", "c"], ["a", "b", "c"]],
      step_checks: [{ result: "275000", accepts: [] }, { result: "270000", accepts: [] }, { result: "cửa hàng B", accepts: [] }],
      hints: [1, 2, 3].map((level) => ({ level, text: "g" })),
    });
    vi.mocked(askJson).mockResolvedValue({ steps: [{ step: 3, verdict: "đủ", evidence: "mua ở B rẻ hơn do 270000 < 275000" }] } as never);
    const r = await stepTurn(cfg, sess(), tc, "tiền ở A là 275000\ntiền ở B là 270000\nmua ở B rẻ hơn do 270000 < 275000", "t1", []);
    expect(lastUpdate()?.progress).toBe(0b111);
    expect(r.done).toBe(true);
  });
  it("hồi quy ade0cf51: kết luận so sánh đảo chiều, AI lỡ duyệt đủ: vẫn không ghi nhận bước kết luận", async () => {
    const tc = problemSchema.parse({
      id: "T5", title: "Chọn cửa hàng", statement: "An mua 30 quyển vở. Cửa hàng A giảm 15%, cửa hàng B giảm 10%. Nên mua ở cửa hàng nào?",
      solution: { a: 275000, b: 270000, best: "B" },
      solution_steps: ["Cửa hàng A phải trả 275000 đồng.", "Cửa hàng B phải trả 270000 đồng.", "Vì 270000 < 275000 nên chọn cửa hàng B."],
      step_goals: ["Tính tiền ở A", "Tính tiền ở B", "So sánh để kết luận"],
      step_hints: [["a", "b", "c"], ["a", "b", "c"], ["a", "b", "c"]],
      step_checks: [{ result: "275000", accepts: [] }, { result: "270000", accepts: [] }, { result: "cửa hàng B", accepts: [] }],
      hints: [1, 2, 3].map((level) => ({ level, text: "g" })),
    });
    vi.mocked(askJson).mockResolvedValue({ steps: [{ step: 3, verdict: "đủ", evidence: "mua ở B rẻ hơn do 270000 > 275000" }] } as never);
    const r = await stepTurn(cfg, sess(), tc, "tiền ở A là 275000\ntiền ở B là 270000\nmua ở B rẻ hơn do 270000 > 275000", "t1", []);
    expect(lastUpdate()?.progress).toBe(0b011);
    expect(r.done).toBe(false);
    expect(r.reply).toContain('"270000 > 275000" chưa đúng');
  });
  it("dán nguyên đề (có chữ \"cửa hàng B\"): không ghi nhận bước kết luận, không gọi AI", async () => {
    const r = await go("An mua 30 quyển vở. Cửa hàng A giảm 15%, cửa hàng B giảm 10%. Nên mua ở cửa hàng nào?", sess({ progress: 0b011 }));
    expect(vi.mocked(askJson)).not.toHaveBeenCalled();
    expect(lastUpdate()?.progress).toBe(0b011);
    expect(r.done).toBe(false);
    expect(r.reply).toMatch(/chép lại đề/);
  });
  it("dán trang giao diện chứa đề kèm khung chat: không qua bước", async () => {
    ai({ verdict: "chưa làm", scenario: "chua_lam" });
    const r = await go("MathStep AI\nĐề bài\nAn mua 30 quyển vở. Cửa hàng A giảm 15%, cửa hàng B giảm 10%. Nên mua ở cửa hàng nào?\nChatbot:", sess({ progress: 0b011 }));
    expect(lastUpdate()?.progress).toBe(0b011);
    expect(r.done).toBe(false);
  });
});

describe("stepTurn: bước đã hiện lời giải phải gõ lại", () => {
  it("gõ lại đúng kết quả bước: ghi nhận và sang bước kế, giữ cờ đã giải hộ", async () => {
    const r = await run("$A = 3 + 4 = 7$", sess({ revealed: 1, hint_level: 3 }));
    expect(lastUpdate()?.progress).toBe(1);
    expect((lastUpdate() as { revealed?: number }).revealed).toBe(1);
    expect(r.reply).toMatch(/viết tiếp/);
    expect(r.reply).not.toMatch(/Bước \d/);
  });
  it("chưa gõ lại đúng: nhắc gõ lại, không hiện thêm lời giải hay tự qua bước", async () => {
    ai({ verdict: "sai", scenario: "sai_so", reply: "Bạn viết chưa khớp" });
    const r = await run("không biết", sess({ revealed: 1, hint_level: 3, stall: 4 }));
    expect(lastUpdate()?.progress).toBe(0);
    expect(r.reply).toMatch(/gõ lại lời giải vừa hiện/);
    expect(r.reply).not.toMatch(/bước 1\/3/i);
  });
  it("gõ lại gần giống (thiếu vài chữ): vẫn ghi nhận, không gọi AI soát, giữ cờ đã giải hộ", async () => {
    const p3 = problemSchema.parse({
      id: "T6", title: "t", statement: "Tính A rồi C với số 3 và 4.", solution: { c: 15 },
      solution_steps: ["Ta tính tổng của hai số đề cho bằng cách cộng chúng lại với nhau là 7 đơn vị.", "Vậy $C = 7 + 8 = 15$."],
      step_checks: [{ result: "", accepts: [] }, { result: "15", accepts: [] }],
      hints: [1, 2, 3].map((level) => ({ level, text: "g" })),
    });
    vi.mocked(askJson).mockResolvedValue({ steps: [] } as never);
    await stepTurn(cfg, sess({ revealed: 1, hint_level: 3 }), p3, "Ta tính tổng của hai số đề cho bằng cách cộng chúng lại với nhau là 7.", "t1", []);
    expect(lastUpdate()?.progress).toBe(1);
    expect((lastUpdate() as { revealed?: number }).revealed).toBe(1);
    expect(vi.mocked(askJson)).not.toHaveBeenCalled();
  });
  it("gõ lại khác nghĩa: không ghi nhận", async () => {
    ai({ verdict: "sai", scenario: "sai_so", reply: "Bạn viết chưa khớp" });
    await run("Bạn tính diện tích của hình tròn nhé", sess({ revealed: 1, hint_level: 3, stall: 4 }));
    expect(lastUpdate()?.progress).toBe(0);
  });
  it("không còn chốt phiên theo số lượt: nộp lượt thứ 30 vẫn tiếp tục", async () => {
    ai({ verdict: "sai", scenario: "sai_so", reply: "Bạn viết chưa khớp" });
    const all: Msg[] = Array.from({ length: 30 }, () => ({ role: "student" as const, content: "3 + 5", hint_level: null }));
    const r = await run("3 + 6", sess(), all);
    expect(r.done).toBe(false);
  });
});

describe("stepHint: thang gợi ý AI viết từ đề đã chuẩn hóa", () => {
  const hint = (level: number, p = prob, mask = 0) => stepHint(cfg, sess({ hint_level: level, progress: mask }), p, "t1");
  const say = (reply: string) => vi.mocked(askJson).mockResolvedValue({ reply } as never);
  it("mức tăng theo hint_level và lời AI được dùng nguyên khi không lộ kết quả", async () => {
    say("Bạn nhìn hai số đề cho và xem cần ghép chúng bằng phép nào.");
    expect((await hint(0)).reply).toBe("Bạn nhìn hai số đề cho và xem cần ghép chúng bằng phép nào.");
    expect(vi.mocked(askJson).mock.calls[0][1]).toContain("Gợi ý mức 1");
    await hint(1);
    expect(vi.mocked(askJson).mock.calls[1][1]).toContain("Gợi ý mức 2");
    await hint(2);
    expect(vi.mocked(askJson).mock.calls[2][1]).toContain("Gợi ý mức 3");
  });
  it("prompt chỉ dùng lời giải của đề, cấm nhắc số thứ tự bước, không có chỉ dẫn theo bước cũ", async () => {
    say("Gợi ý chung chung.");
    await hint(0);
    const sys = vi.mocked(askJson).mock.calls[0][1] as string;
    expect(sys).toContain("Tính $A = 3 + 4 = 7$");
    expect(sys).toMatch(/không nhắc "bước"/);
    expect(sys).not.toContain("Tính A từ hai số đề cho"); // step_goals cũ không còn dùng
    expect(sys).not.toContain("Nhìn hai số đề cho."); // step_hints cũ không còn dùng
  });
  it("gợi ý nhận bài làm vừa nộp và các gợi ý trước để bám lỗi, không lặp", async () => {
    say("Bạn soát lại phép tính cuối nhé.");
    const all: Msg[] = [{ role: "student", content: "3 + 4 = 8", hint_level: null }, { role: "bot", content: "Bạn nhìn lại hai số đề cho.", hint_level: 1 }];
    await stepHint(cfg, sess({ hint_level: 1, progress: 0 }), prob, "t1", all);
    const call = vi.mocked(askJson).mock.calls[0];
    expect(call[2]).toEqual([{ role: "user", text: expect.stringContaining("HS: 3 + 4 = 8") }]);
    expect(call[1]).toContain("KHÔNG lặp lại ý các lời bot trước");
  });
  it("AI chép lại gợi ý đã đưa: bỏ, dùng gợi ý chung của đề cùng mức", async () => {
    say("Bạn soát lại phép tính nhé.");
    const p = { ...prob, hints: [{ level: 1, text: "Đọc lại đề" }, { level: 2, text: "Dùng phép cộng" }, { level: 3, text: "Cộng hai số" }] };
    const all: Msg[] = [{ role: "bot", content: "Bạn soát lại phép tính nhé.", hint_level: 1, meta: { kind: "hint" } }];
    expect((await stepHint(cfg, sess({ hint_level: 1, progress: 0 }), p, "t1", all)).reply).toBe("Dùng phép cộng");
  });
  it("lời AI lộ kết quả: bỏ, dùng gợi ý chung của đề (p.hints) cùng mức", async () => {
    say("Kết quả của phần này là 7 đó bạn.");
    const p = { ...prob, hints: [{ level: 1, text: "Đọc lại đề" }, { level: 2, text: "Dùng phép cộng" }, { level: 3, text: "Cộng hai số" }] };
    expect((await hint(1, p)).reply).toBe("Dùng phép cộng");
  });
  it("AI lỗi và gợi ý chung cũng lộ: câu chung, không nhắc bước", async () => {
    vi.mocked(askJson).mockRejectedValue(new Error("AI_SLOW"));
    const p = { ...prob, hints: [1, 2, 3].map((level) => ({ level, text: "Đáp số là 15" })) };
    const r = await hint(0, p);
    expect(r.reply).toMatch(/đọc lại đề/i);
    expect(r.reply).not.toMatch(/bước/i);
  });
});

// Cách làm KHÁC lời giải mẫu (giai đoạn 1 và 2): AI phán, server giữ cổng.
describe("stepTurn: cách làm khác đúng", () => {
  const alt = (o: { errors?: string[]; on_track?: boolean; complete?: boolean }, cheap = o) => {
    let n = 0; // lượt đầu dùng o, các lượt xác nhận sau dùng cheap
    vi.mocked(askJson).mockImplementation((async (_c: unknown, sys: string) => {
      if (sys.includes("soát CÁCH LÀM")) { const x = n++ === 0 ? o : cheap; /* lượt xác nhận bật suy nghĩ */ return { errors: [], on_track: false, complete: false, ...x }; }
      return { verdict: "sai", scenario: "sai_so", reply: "Bạn viết chưa khớp", evidence: "" };
    }) as never);
  };
  const prev: Msg[] = [{ role: "student", content: "2 x (3 + 4) = 14", hint_level: null }];
  const altCalls = () => vi.mocked(askJson).mock.calls.filter((c) => (c[1] as string).includes("soát CÁCH LÀM"));
  it("cách khác đúng và đủ (hai model đồng ý, có nêu đáp án cuối): ghi nhận mọi bước, xong bài", async () => {
    alt({ complete: true, on_track: true });
    const r = await run("14 + 1 = 15", sess(), prev);
    expect(lastUpdate()?.progress).toBe(0b111);
    expect(r.done).toBe(true);
    expect(altCalls()).toHaveLength(2); // lượt đầu, rồi lượt xác nhận kỹ hơn
  });
  it("đúng hướng nhưng chưa xong: khẳng định, không đẩy về bước chuẩn, không tính kẹt", async () => {
    alt({ on_track: true, complete: false });
    const r = await run("2 x 3 + 2 x 4 = 14", sess({ stall: 2 }), []);
    expect(lastUpdate()?.progress).toBe(0);
    expect(lastUpdate()?.stall).toBe(2);
    expect(r.reply).toMatch(/đúng/);
    expect(r.reply).not.toMatch(/Bạn cần hoàn thành bước/);
  });
  it("AI chỉ ra dòng sai (trích đúng từ tin): nêu đúng dòng đó, không ghi nhận", async () => {
    alt({ errors: ["lấy 3 nhân 4"] });
    const r = await run("lấy 3 nhân 4 là 12 rồi cộng 1", sess(), []);
    expect(r.reply).toContain('"lấy 3 nhân 4" chưa đúng');
    expect(lastUpdate()?.progress).toBe(0);
  });
  it("model rẻ không đồng ý: không khen, rơi về phản hồi thường", async () => {
    alt({ on_track: true, complete: true }, { on_track: false, complete: false });
    const r = await run("14 + 1 = 15", sess(), prev);
    expect(lastUpdate()?.progress).toBe(0);
    expect(r.reply).not.toMatch(/đúng hướng|đều đúng/);
  });
  it("chỉ nêu kết quả trơn dù AI nói đủ: không qua cổng (cần phép biến đổi)", async () => {
    alt({ on_track: true, complete: true });
    const r = await run("C = 15", sess(), []);
    expect(lastUpdate()?.progress).toBe(0);
    expect(r.done).toBe(false);
  });
  it("đang đi theo cách khác (lời bot trước khẳng định đúng hướng): dòng kết luận xét theo cả bài, không qua lượt chấm một bước", async () => {
    alt({ complete: true, on_track: true });
    const all2: Msg[] = [...prev, { role: "bot", content: "Phần bạn viết là đúng, cách làm này hợp lý. Bạn tiếp tục nhé.", hint_level: 0 }];
    const r = await run("Vậy C = 15", sess(), all2);
    expect(lastUpdate()?.progress).toBe(0b111);
    expect(r.done).toBe(true);
    expect(vi.mocked(askJson).mock.calls.some((c) => (c[1] as string).includes("nhận xét BÀI LÀM"))).toBe(false);
  });
  it("model rẻ không xác nhận lỗi AI chính báo: không bác oan học sinh", async () => {
    alt({ errors: ["lấy 3 nhân 4"] }, { errors: [], on_track: false, complete: false });
    const r = await run("lấy 3 nhân 4 là 12 rồi cộng 1", sess(), []);
    expect(r.reply).not.toContain("chưa đúng");
  });
  it("AI lỗi: giữ hành vi cũ", async () => {
    vi.mocked(askJson).mockImplementation((async (_c: unknown, sys: string) => { if (sys.includes("soát CÁCH LÀM")) throw new Error("AI_SLOW"); return { verdict: "sai", scenario: "sai_so", reply: "Bạn viết chưa khớp", evidence: "" }; }) as never);
    const r = await run("14 + 1 = 15", sess(), prev);
    expect(lastUpdate()?.progress).toBe(0);
    expect(r.done).toBe(false);
  });
});

describe("stepTurn: số trơn không gọi AI", () => {
  it("số trơn sai (không khớp mốc, không khớp bẫy): không gọi AI, trả câu nêu số, không nêu bước", async () => {
    ai({ verdict: "sai", scenario: "sai_so", reply: "x" });
    const r = await run("50");
    expect(vi.mocked(askJson)).not.toHaveBeenCalled();
    expect(r.reply).toMatch(/Con số 50 chưa khớp/);
    expect(r.reply).not.toMatch(/bước 1\/3/i);
    expect(lastUpdate()?.progress).toBe(0);
  });
  it("số trơn trùng kết quả phần sau: vẫn bắt viết cách làm, không gọi AI", async () => {
    ai({});
    const r = await run("14");
    expect(vi.mocked(askJson)).not.toHaveBeenCalled();
    expect(r.reply).toMatch(/chưa thấy cách làm các phần trước/);
  });
  it("số trơn đúng: ghi nhận bước, không gọi AI soát lập luận", async () => {
    ai({});
    const r = await run("7");
    expect(vi.mocked(askJson)).not.toHaveBeenCalled();
    expect(lastUpdate()?.progress).toBe(1);
    expect(r.reply).toMatch(/Đúng rồi/);
  });
  it("tin có chữ hoặc phép tính vẫn đi đường AI", async () => {
    ai({ verdict: "sai", scenario: "sai_so", reply: "" });
    await run("mình nghĩ A là 9 vì cộng hai số");
    expect(vi.mocked(askJson)).toHaveBeenCalled();
  });
});
