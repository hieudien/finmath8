import { beforeEach, describe, expect, it, vi } from "vitest";

// getLink chuẩn hóa cột mode: giá trị rỗng, lạ hoặc thiếu thì coi là "steps"; "worksheet" giữ nguyên.
let row: Record<string, unknown> | null = null;
vi.mock("../lib/supabase/admin", () => {
  const q = (table: string): unknown => new Proxy(() => {}, { get: (_t, k) => (k === "then" ? (f: (v: unknown) => unknown) => f({ data: table === "public_links" ? row : [], error: null }) : k === "maybeSingle" ? () => q(table) : () => q(table)), apply: () => q(table) });
  return { admin: () => ({ from: (t: string) => q(t) }) };
});
import { getLink } from "../lib/links";

const base = { id: "l1", teacher_id: "t1", active: true, expires_at: null, problems_snapshot: [] };
let n = 0;
const load = async (mode: unknown) => { row = { ...base, ...(mode === undefined ? {} : { mode }) }; return getLink(`slug-${n++}`); }; // slug khác nhau để không dính cache 30 giây

describe("getLink: mode của liên kết", () => {
  beforeEach(() => { row = null; });
  it("giữ nguyên steps và worksheet", async () => {
    expect((await load("steps"))?.mode).toBe("steps");
    expect((await load("worksheet"))?.mode).toBe("worksheet");
  });
  it("rỗng, lạ hoặc thiếu cột thì coi là steps", async () => {
    expect((await load(""))?.mode).toBe("steps");
    expect((await load("chat"))?.mode).toBe("steps");
    expect((await load(null))?.mode).toBe("steps");
    expect((await load(undefined))?.mode).toBe("steps");
  });
});
