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
import { stepTurn } from "../lib/chat/steps";
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
    expect(r.reply).toMatch(/Bạn cần hoàn thành bước 1\/3 trước nhé/);
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
    expect(r.reply).not.toMatch(/lời giải bước 1\/3/);
    expect(lastUpdate()?.stall).toBe(4);
    expect(lastUpdate()?.progress).toBe(0);
  });
  it("lượt sai thường tính kẹt: đủ lượt thì hiện lời giải bước và ghi tiến độ", async () => {
    ai({ verdict: "sai", scenario: "sai_phuong_phap", reply: "Cách này chưa phù hợp" });
    const r = await run("3 x 4", sess(exhausted));
    expect(r.reply).toMatch(/lời giải bước 1\/3/);
    expect(lastUpdate()?.progress).toBe(1);
  });
  it("gần đúng quá 6 lần ở một bước thì cũng tính kẹt (có trần)", async () => {
    ai({ verdict: "thiếu", scenario: "dung_huong_thieu", reply: "Bạn mới viết một vế" });
    const all: Msg[] = [{ role: "bot", content: "Bước 1/3: Tính A", hint_level: 0 }, ...Array.from({ length: 7 }, () => ({ role: "student" as const, content: "3 +", hint_level: null }))];
    const r = await run("3 +", sess(exhausted), all);
    expect(r.reply).toMatch(/lời giải bước 1\/3/);
  });
});

describe("stepTurn: qua bước", () => {
  it("kết quả đúng của bước hiện tại được ghi nhận và nêu bước kế", async () => {
    ai({});
    const r = await run("A = 3 + 4 = 7");
    expect(lastUpdate()?.progress).toBe(1);
    expect(r.reply).toMatch(/Bước 2\/3/);
  });
});
