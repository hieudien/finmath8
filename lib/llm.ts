import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import { PROVIDERS, type Provider } from "@/lib/models";

export type LlmCfg = {
  provider: Provider;
  key: string;
  model: string;
  temperature: number;
  onFallback?: (from: string, to: string, reason: string) => void; // để ghi nhật ký khi tự đổi model
};
type Turn = { role: "user" | "model"; text: string };

async function callGemini(cfg: LlmCfg, system: string, turns: Turn[]) {
  const ai = new GoogleGenAI({ apiKey: cfg.key });
  const res = await ai.models.generateContent({
    model: cfg.model,
    contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    config: { systemInstruction: system, responseMimeType: "application/json", temperature: cfg.temperature },
  });
  return res.text ?? "";
}

// ponytail: không gửi temperature cho OpenAI (nhiều model suy luận chỉ nhận mặc định). Thêm khi cần chỉnh.
async function callOpenAI(cfg: LlmCfg, system: string, turns: Turn[], json = true): Promise<string> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [{ role: "system", content: system }, ...turns.map((t) => ({ role: t.role === "model" ? "assistant" : "user", content: t.text }))],
  };
  if (json) body.response_format = { type: "json_object" }; // yêu cầu prompt có chữ "JSON": mọi prompt của app đều có
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    if (json && r.status === 400 && /response_format|json_object/i.test(t)) return callOpenAI(cfg, system, turns, false); // model không hỗ trợ JSON mode: dựa vào prompt
    throw new Error(`OpenAI ${r.status}: ${t.slice(0, 300)}`);
  }
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? "";
}

// Model nào vừa báo hết quota thì nhớ lại một lúc để các lượt sau bỏ qua ngay, khỏi gọi lại vô ích.
// ponytail: bộ nhớ của 1 instance. Dùng bảng DB/Redis nếu chạy nhiều instance.
const dead = new Map<string, number>();
const deadKey = (c: LlmCfg, model: string) => `${c.provider}:${c.key.slice(-8)}:${model}`;
const isQuota = (e: unknown) => /PerDay|insufficient_quota|RESOURCE_EXHAUSTED|429|no longer available|404/i.test(String(e));
const isLongQuota = (e: unknown) => /PerDay|insufficient_quota|no longer available|404/i.test(String(e));

// Hết quota (hoặc model không còn) thì tự thử model kế tiếp của cùng nhà cung cấp, tối đa 4 model.
export async function askJson<T extends z.ZodType>(cfg: LlmCfg, system: string, turns: Turn[], schema: T): Promise<z.infer<T>> {
  const all = [cfg.model, ...PROVIDERS[cfg.provider].models.map((m) => m.id).filter((id) => id !== cfg.model)].slice(0, 4);
  const alive = all.filter((m) => (dead.get(deadKey(cfg, m)) ?? 0) < Date.now());
  const chain = alive.length ? alive : [cfg.model];
  let last: unknown;
  for (let i = 0; i < chain.length; i++) {
    try {
      return await askOne({ ...cfg, model: chain[i] }, system, turns, schema);
    } catch (e) {
      if (!isQuota(e)) throw e;
      last = e;
      dead.set(deadKey(cfg, chain[i]), Date.now() + (isLongQuota(e) ? 60 : 2) * 60_000);
      if (i + 1 < chain.length) cfg.onFallback?.(chain[i], chain[i + 1], String(e).slice(0, 120));
    }
  }
  throw last;
}

async function askOne<T extends z.ZodType>(cfg: LlmCfg, system: string, turns: Turn[], schema: T): Promise<z.infer<T>> {
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = lastErr ? [...turns, { role: "user" as const, text: `JSON trước không hợp lệ (${lastErr}). Trả lại JSON đúng định dạng.` }] : turns;
    const text = await withRetry(() => (cfg.provider === "openai" ? callOpenAI(cfg, system, t) : callGemini(cfg, system, t)));
    try {
      const parsed = schema.safeParse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")));
      if (parsed.success) return parsed.data;
      lastErr = parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ");
    } catch {
      lastErr = "không phải JSON";
    }
  }
  throw new Error("Mô hình AI trả dữ liệu sai định dạng: " + lastErr);
}

// Kiểm tra key và model bằng cách tra thông tin model: không tốn lượt gọi sinh nội dung.
export async function checkKey(provider: Provider, key: string, model: string) {
  const r =
    provider === "openai"
      ? await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, { headers: { authorization: `Bearer ${key}` } })
      : await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, { headers: { "x-goog-api-key": key } });
  if (r.ok) return;
  if (r.status === 401 || r.status === 403 || (provider === "gemini" && r.status === 400)) throw new Error("key");
  if (r.status === 404) throw new Error("model");
  throw new Error("other " + r.status);
}

// Hết quota theo ngày (PerDay) hoặc hết tiền (insufficient_quota) thì không thử lại: chờ cũng vô ích.
// 503 và 429 tạm thời: thử lại 2 lần, cách nhau 4–8 giây.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const s = String(e);
      if (i >= 2 || /PerDay|insufficient_quota/.test(s) || !/429|RESOURCE_EXHAUSTED|\b50\d\b|UNAVAILABLE|overload|fetch failed/i.test(s)) throw e;
      await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
    }
  }
}
