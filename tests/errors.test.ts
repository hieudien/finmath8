import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const insert = vi.fn<(row: unknown) => Promise<{ error: { message: string } | null }>>(async () => ({ error: null }));
vi.mock("@/lib/supabase/admin", () => ({ admin: () => ({ from: () => ({ insert }) }) }));
vi.spyOn(console, "error").mockImplementation(() => {});

import { swallow, watchdog, reportError, type Trace } from "@/lib/errors";

type Row = { kind: string; where_: string; message: string; meta: Record<string, unknown>; teacher_id: string | null };
const last = () => insert.mock.calls.at(-1)?.[0] as Row;

beforeEach(() => { insert.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe("swallow", () => {
  it("trả null nhưng vẫn ghi lỗi, đánh dấu swallowed", async () => {
    const r = await Promise.reject(new Error("AI_TIMEOUT: x")).catch(swallow("giải đề", { teacherId: "t1", actor: "teacher" }));
    expect(r).toBeNull();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ where_: "giải đề", kind: "timeout", teacher_id: "t1", meta: { swallowed: true } });
  });
  it("chỉ ghi tối đa 30 dòng mỗi phút nhưng vẫn trả null", async () => {
    insert.mockClear();
    const f = swallow("hàng loạt");
    for (let i = 0; i < 50; i++) expect(await f(new Error("quota"))).toBeNull();
    expect(insert.mock.calls.length).toBeLessThanOrEqual(30);
  });
});

describe("reportError", () => {
  it("DB hỏng không ném lỗi và vẫn trả mã", async () => {
    insert.mockResolvedValueOnce({ error: { message: "db down" } });
    const ref = await reportError(new Error("boom"), "đâu đó");
    expect(ref).toMatch(/^[0-9A-F]{6}$/);
  });
  it("message dài tới 1000 ký tự", async () => {
    await reportError(new Error("x".repeat(1500)), "w");
    expect(last().message).toHaveLength(1000);
  });
});

describe("watchdog", () => {
  it("quá hạn mà chưa dừng thì ghi một dòng watchdog kèm action và teacherId tìm được", async () => {
    vi.useFakeTimers();
    const ctx: Trace = { action: "normalize" };
    watchdog("/api/problems", ctx, { ms: 55_000 });
    ctx.teacherId = "t9"; // handler gán sau khi đồng hồ đã chạy: đồng hồ đọc giá trị lúc nổ
    await vi.advanceTimersByTimeAsync(55_001);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(last()).toMatchObject({ kind: "watchdog", where_: "/api/problems", teacher_id: "t9", meta: { action: "normalize" } });
  });
  it("dừng kịp thì không ghi gì", async () => {
    vi.useFakeTimers();
    const stop = watchdog("/api/x", {}, { ms: 1000 });
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(insert).not.toHaveBeenCalled();
  });
});
