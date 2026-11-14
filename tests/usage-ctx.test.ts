import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn(async () => ({ error: null }));
vi.mock("../lib/supabase/admin", () => ({ admin: () => ({ from: () => ({ insert }) }) }));
vi.mock("../lib/errors", () => ({ reportError: vi.fn(), kindOf: vi.fn() }));
vi.mock("../lib/crypto", () => ({ decrypt: vi.fn() }));
vi.mock("../lib/ttl", () => ({ ttl: (_: number, f: unknown) => f }));

import { withCtx } from "../lib/teacher";
import type { LlmCfg, Usage } from "../lib/llm";

const base = { provider: "gemini", key: "k", model: "m", temperature: 0, teacherId: "t1" } as LlmCfg;
const u: Usage = { provider: "gemini", model: "m", input: 10, cached: 0, output: 5, thoughts: 2, use: "step" };

describe("withCtx: token ghi kèm phiên và đề", () => {
  beforeEach(() => insert.mockClear());

  it("ghi session_id, problem, link_id, anon_id", async () => {
    withCtx(base, { sessionId: "s1", problem: "BT01", linkId: "l1", anonId: "a1" }).onUsage!(u);
    await Promise.resolve();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ action: "ai_usage", teacher_id: "t1", link_id: "l1", anon_id: "a1", meta: { ...u, session_id: "s1", problem: "BT01" } }));
  });

  it("chỉ có đề (chuẩn bị đề) thì không có session_id", async () => {
    withCtx(base, { problem: "BT01" }).onUsage!(u);
    await Promise.resolve();
    const row = (insert.mock.calls[0] as unknown as [{ meta: Record<string, unknown> }])[0];
    expect(row.meta.problem).toBe("BT01");
    expect("session_id" in row.meta).toBe(false);
  });

  it("không đổi cfg gốc dùng chung", () => {
    const cfg = { ...base, onUsage: vi.fn() };
    const c = withCtx(cfg, { sessionId: "s1" });
    expect(c).not.toBe(cfg);
    expect(cfg.onUsage).not.toBe(c.onUsage);
  });
});
