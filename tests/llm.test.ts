import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { friendly } from "../lib/errors";

// Giả lập SDK Gemini: mỗi lượt gọi ghi lại model, hành vi theo từng model do test đặt.
const used: string[] = [];
let behave: (model: string) => Promise<{ text: string }> = async () => ({ text: '{"a":1}' });
vi.mock("@google/genai", () => ({
  ThinkingLevel: { LOW: "LOW", MINIMAL: "MINIMAL" },
  GoogleGenAI: class {
    models = { generateContent: async ({ model }: { model: string }) => { used.push(model); return behave(model); } };
  },
}));

import { askJson } from "../lib/llm";

const quota = () => Promise.reject(new Error('429 RESOURCE_EXHAUSTED PerDay: You exceeded your current quota'));
const schema = z.object({ a: z.number() });
const FIRST = "gemini-3.5-flash-lite", SECOND = "gemini-3.5-flash";

beforeEach(() => { used.length = 0; });

describe("tự đổi model khi hết quota", () => {
  it("đổi sang model kế tiếp, nhớ model đã hết", async () => {
    behave = async (m) => (m === FIRST ? quota() : { text: '{"a":1}' });
    const events: string[] = [];
    const cfg = { provider: "gemini" as const, key: "AIza-test-aaaa1111", model: FIRST, temperature: 0.3, onFallback: (f: string, t: string) => events.push(`${f}>${t}`) };
    expect(await askJson(cfg, "JSON", [{ role: "user", text: "x" }], schema)).toEqual({ a: 1 });
    expect(used).toEqual([FIRST, SECOND]);
    expect(events).toEqual([`${FIRST}>${SECOND}`]);
    used.length = 0;
    await askJson(cfg, "JSON", [{ role: "user", text: "x" }], schema);
    expect(used).toEqual([SECOND]); // model đầu bị bỏ qua
  });

  it("model chậm quá attemptMs thì đổi sang model kế", async () => {
    behave = (m) => (m === FIRST ? new Promise(() => {}) : Promise.resolve({ text: '{"a":2}' })); // model đầu treo mãi
    const cfg = { provider: "gemini" as const, key: "AIza-test-cccc3333", model: FIRST, temperature: 0.3 };
    expect(await askJson(cfg, "JSON", [{ role: "user", text: "x" }], schema, { attemptMs: 50, deadlineMs: 5000 })).toEqual({ a: 2 });
    expect(used).toEqual([FIRST, SECOND]);
  });

  it("lỗi khác (key sai) thì không đổi model", async () => {
    behave = () => Promise.reject(new Error("401 API key not valid"));
    const cfg = { provider: "gemini" as const, key: "AIza-test-bbbb2222", model: FIRST, temperature: 0.3 };
    await expect(askJson(cfg, "JSON", [{ role: "user", text: "x" }], schema)).rejects.toThrow(/401/);
    expect(used).toEqual([FIRST]);
  });
});

describe("lỗi thân thiện", () => {
  it("phân loại", () => {
    expect(friendly(new Error("429 RESOURCE_EXHAUSTED"), "teacher").message).toMatch(/hạn mức/);
    expect(friendly(new Error("429 PerDay"), "student").message).toMatch(/báo giáo viên/);
    expect(friendly(new Error("400 API key not valid"), "teacher").message).toMatch(/Cài đặt/);
    expect(friendly(new Error("503 UNAVAILABLE"), "student").known).toBe(true);
    expect(friendly(new Error("TypeError: x is undefined"), "teacher").known).toBe(false);
  });
});
