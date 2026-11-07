import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { askJson } from "../lib/llm";
import { friendly } from "../lib/errors";

const ok = (text: string) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });
const quota = () => new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }), { status: 429 });
const schema = z.object({ a: z.number() });

afterEach(() => vi.unstubAllGlobals());

describe("tự đổi model khi hết quota", () => {
  it("đổi sang model kế tiếp, nhớ model đã hết", async () => {
    const used: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const model = JSON.parse(String(init.body)).model as string;
      used.push(model);
      return model === "gpt-6-luna" ? quota() : ok('{"a":1}');
    }));
    const events: string[] = [];
    const cfg = { provider: "openai" as const, key: "sk-test-aaaa1111", model: "gpt-6-luna", temperature: 0.3, onFallback: (f: string, t: string) => events.push(`${f}>${t}`) };
    expect(await askJson(cfg, "JSON", [{ role: "user", text: "x" }], schema)).toEqual({ a: 1 });
    expect(used).toEqual(["gpt-6-luna", "gpt-6.1-terra"]);
    expect(events).toEqual(["gpt-6-luna>gpt-6.1-terra"]);
    used.length = 0;
    await askJson(cfg, "JSON", [{ role: "user", text: "x" }], schema);
    expect(used).toEqual(["gpt-6.1-terra"]); // luna bị bỏ qua
  });

  it("model chậm quá attemptMs thì đổi sang model kế", async () => {
    const used: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const model = JSON.parse(String(init.body)).model as string;
      used.push(model);
      return model === "gpt-6-luna" ? new Promise<Response>(() => {}) : ok('{"a":2}'); // luna treo mãi
    }));
    const cfg = { provider: "openai" as const, key: "sk-test-cccc3333", model: "gpt-6-luna", temperature: 0.3 };
    expect(await askJson(cfg, "JSON", [{ role: "user", text: "x" }], schema, { attemptMs: 50, deadlineMs: 5000 })).toEqual({ a: 2 });
    expect(used).toEqual(["gpt-6-luna", "gpt-6.1-terra"]);
  });

  it("lỗi khác (key sai) thì không đổi model", async () => {
    const f = vi.fn(async () => new Response("bad key", { status: 401 }));
    vi.stubGlobal("fetch", f);
    const cfg = { provider: "openai" as const, key: "sk-test-bbbb2222", model: "gpt-6-luna", temperature: 0.3 };
    await expect(askJson(cfg, "JSON", [{ role: "user", text: "x" }], schema)).rejects.toThrow(/401/);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("lỗi thân thiện", () => {
  it("phân loại", () => {
    expect(friendly(new Error("429 insufficient_quota"), "teacher").message).toMatch(/hạn mức/);
    expect(friendly(new Error("429 PerDay"), "student").message).toMatch(/báo giáo viên/);
    expect(friendly(new Error("OpenAI 401 Incorrect API key"), "teacher").message).toMatch(/Cài đặt/);
    expect(friendly(new Error("503 UNAVAILABLE"), "student").known).toBe(true);
    expect(friendly(new Error("TypeError: x is undefined"), "teacher").known).toBe(false);
  });
});
