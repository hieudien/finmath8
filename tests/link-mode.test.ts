import { beforeEach, describe, expect, it, vi } from "vitest";

// Mỗi liên kết một chế độ cố định: API chat chỉ nhận liên kết "steps", API worksheet chỉ nhận liên kết "worksheet".
const store = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => (store.has(k) ? { value: store.get(k) } : undefined), set: (k: string, v: string) => void store.set(k, v) }) }));
vi.mock("../lib/links", () => ({ getLink: vi.fn() }));
vi.mock("../lib/log", () => ({ log: vi.fn(async () => {}) }));
vi.mock("../lib/errors", async (orig) => ({ ...(await orig<object>()), reportError: vi.fn(async () => {}) }));
// Bộ dựng truy vấn giả: mọi chuỗi .eq/.in/... đều trả về chính nó, await ra "không có dòng nào".
vi.mock("../lib/supabase/admin", () => {
  const q: unknown = new Proxy(() => {}, { get: (_t, k) => (k === "then" ? (f: (v: unknown) => unknown) => f({ data: [], error: null, count: 0 }) : () => q), apply: () => q });
  return { admin: () => ({ from: () => q, rpc: () => q }) };
});
import { getLink } from "../lib/links";
import { isMode, modeMismatch } from "../lib/modes";
import { POST as chat } from "../app/api/chat/route";
import { POST as worksheet } from "../app/api/worksheet/route";

const link = (mode: string) => ({ id: "l1", teacher_id: "t1", active: true, expires_at: null, mode, problems: [] });
const call = (post: typeof chat, slug = "abcdef") =>
  post(new Request("http://x/api", { method: "POST", body: JSON.stringify({ action: "resume_check", slug, problemCode: "P1", studentName: "Test Mode", studentClass: "8A" }) }));

describe("modeMismatch", () => {
  it("khớp thì không lệch, khác thì lệch", () => {
    expect(modeMismatch({ mode: "steps" }, "steps")).toBe(false);
    expect(modeMismatch({ mode: "worksheet" }, "steps")).toBe(true);
    expect(modeMismatch({ mode: "steps" }, "worksheet")).toBe(true);
  });
  it("isMode chỉ nhận chế độ có thật", () => {
    expect(isMode("steps") && isMode("worksheet")).toBe(true);
    expect(isMode("chat") || isMode("") || isMode(null)).toBe(false);
  });
});

describe("cổng chế độ của liên kết", () => {
  beforeEach(() => { store.clear(); vi.mocked(getLink).mockReset(); });

  it("/api/chat từ chối liên kết worksheet (409), nhận liên kết steps", async () => {
    vi.mocked(getLink).mockResolvedValue(link("worksheet") as never);
    const bad = await call(chat);
    expect(bad.status).toBe(409);
    expect((await bad.json()).error).toMatch(/kiểu làm bài khác/);
    vi.mocked(getLink).mockResolvedValue(link("steps") as never);
    expect((await call(chat)).status).toBe(200);
  });

  it("/api/worksheet từ chối liên kết steps (409), nhận liên kết worksheet", async () => {
    vi.mocked(getLink).mockResolvedValue(link("steps") as never);
    const bad = await call(worksheet);
    expect(bad.status).toBe(409);
    expect((await bad.json()).error).toMatch(/kiểu làm bài khác/);
    vi.mocked(getLink).mockResolvedValue(link("worksheet") as never);
    expect((await call(worksheet)).status).toBe(200);
  });
});
