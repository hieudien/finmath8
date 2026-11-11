import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { PROVIDERS, type Provider } from "@/lib/models";

export type LlmCfg = {
  provider: Provider;
  key: string;
  model: string;
  temperature: number;
  think?: boolean | "low"; // true: suy nghĩ sâu (chậm hơn); "low": suy nghĩ nhẹ (nhận xét bước giải). Mặc định tắt: chat cần nhanh
  maxTokens?: number; // giới hạn độ dài trả lời, tránh model nói dài
  onFallback?: (from: string, to: string, reason: string) => void; // để ghi nhật ký khi tự đổi model
  onUsage?: (u: Usage) => void; // mỗi lượt gọi thành công: số token để đo chi phí và kiểm tra cache
  signal?: AbortSignal; // askJson đặt khi hủy lượt gọi chậm, khỏi bị tính tiền thêm
  seed?: number; // Gemini: cùng seed + cùng input thì (gần như) cùng câu trả lời. Không bảo đảm tuyệt đối. OpenAI chưa dùng.
  teacherId?: string; // giáo viên sở hữu key: để nơi nuốt lỗi AI vẫn ghi được vào nhật ký lỗi của giáo viên đó
  use?: string; // nhãn "dùng làm gì" của lượt gọi, ghi vào nhật ký để thống kê token
};
export type Usage = { provider: Provider; model: string; input: number; cached: number; output: number; thoughts: number; use?: string; ms?: number };
export type Turn = { role: "user" | "model"; text: string; image?: { mime: string; b64: string } };

// Structured output của Gemini: ép đúng khung JSON, khỏi mô tả định dạng trong prompt và khỏi gọi lại khi JSON sai.
const DROP = new Set(["$schema", "default", "minimum", "maximum", "additionalProperties"]);
const clean = (n: unknown): unknown => Array.isArray(n) ? n.map(clean) : n && typeof n === "object" ? Object.fromEntries(Object.entries(n).filter(([k]) => !DROP.has(k)).map(([k, v]) => [k, clean(v)])) : n;
const jsonSchema = (schema: z.ZodType) => { try { return clean(z.toJSONSchema(schema, { io: "input" })); } catch { return undefined; } };

async function callGemini(cfg: LlmCfg, system: string, turns: Turn[], schema?: z.ZodType, text = false) {
  const ai = new GoogleGenAI({ apiKey: cfg.key });
  const base = { systemInstruction: system, responseMimeType: text ? "text/plain" : "application/json", responseJsonSchema: text ? undefined : schema && jsonSchema(schema), temperature: cfg.temperature, seed: cfg.seed, maxOutputTokens: cfg.maxTokens, abortSignal: cfg.signal };
  const run = (extra: object) => ai.models.generateContent({ model: cfg.model, contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }, ...(t.image ? [{ inlineData: { mimeType: t.image.mime, data: t.image.b64 } }] : [])] })), config: { ...base, ...extra } });
  // Tắt suy nghĩ để trả lời nhanh; model không hỗ trợ mức này (báo lỗi liên quan "thinking") thì gọi lại như thường.
  let res;
  try {
    res = await run(cfg.think === true ? {} : { thinkingConfig: { thinkingLevel: cfg.think === "low" ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL } });
  } catch (e) {
    if (cfg.think === true || !/thinking/i.test(String(e))) throw e;
    res = await run({});
  }
  const u = res.usageMetadata;
  if (u) cfg.onUsage?.({ provider: "gemini", model: cfg.model, input: u.promptTokenCount ?? 0, cached: u.cachedContentTokenCount ?? 0, output: u.candidatesTokenCount ?? 0, thoughts: u.thoughtsTokenCount ?? 0, use: cfg.use });
  return res.text ?? "";
}

// ponytail: không gửi temperature cho OpenAI (nhiều model suy luận chỉ nhận mặc định). Thêm khi cần chỉnh.
async function callOpenAI(cfg: LlmCfg, system: string, turns: Turn[], json = true): Promise<string> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [{ role: "system", content: system }, ...turns.map((t) => ({ role: t.role === "model" ? "assistant" : "user", content: t.image ? [{ type: "text", text: t.text }, { type: "image_url", image_url: { url: `data:${t.image.mime};base64,${t.image.b64}` } }] : t.text }))],
  };
  if (json) body.response_format = { type: "json_object" }; // yêu cầu prompt có chữ "JSON": mọi prompt của app đều có
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: cfg.signal,
  });
  if (!r.ok) {
    const t = await r.text();
    if (json && r.status === 400 && /response_format|json_object/i.test(t)) return callOpenAI(cfg, system, turns, false); // model không hỗ trợ JSON mode: dựa vào prompt
    throw new Error(`OpenAI ${r.status}: ${t.slice(0, 300)}`);
  }
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; completion_tokens_details?: { reasoning_tokens?: number } } };
  const u = j.usage;
  if (u) cfg.onUsage?.({ provider: "openai", model: cfg.model, input: u.prompt_tokens ?? 0, cached: u.prompt_tokens_details?.cached_tokens ?? 0, output: u.completion_tokens ?? 0, thoughts: u.completion_tokens_details?.reasoning_tokens ?? 0, use: cfg.use });
  return j.choices?.[0]?.message?.content ?? "";
}

// Model nào vừa báo hết quota thì nhớ lại một lúc để các lượt sau bỏ qua ngay, khỏi gọi lại vô ích.
// ponytail: bộ nhớ của 1 instance. Dùng bảng DB/Redis nếu chạy nhiều instance.
const dead = new Map<string, number>();
const deadKey = (c: LlmCfg, model: string) => `${c.provider}:${c.key.slice(-8)}:${model}`;
const isQuota = (e: unknown) => /PerDay|insufficient_quota|RESOURCE_EXHAUSTED|429|no longer available|404/i.test(String(e));
const isOverload = (e: unknown) => /\b50\d\b|UNAVAILABLE|overload|high demand|AI_SLOW/i.test(String(e));
const isLongQuota = (e: unknown) => /PerDay|insufficient_quota|no longer available|404/i.test(String(e));

// Hết quota (hoặc model không còn) thì tự thử model kế tiếp của cùng nhà cung cấp, tối đa 4 model.
export async function askJson<T extends z.ZodType>(cfg0: LlmCfg, system: string, turns: Turn[], schema: T, opts: { think?: boolean | "low"; maxTokens?: number; deadlineMs?: number; attemptMs?: number; use?: string; temperature?: number; seed?: number } = {}): Promise<z.infer<T>> {
  const cfg = { ...cfg0, ...opts };
  const deadline = Date.now() + (opts.deadlineMs ?? Infinity); // chat đặt hạn chót để trả lỗi thân thiện trước khi trình duyệt tự báo timeout
  const all = [cfg.model, ...PROVIDERS[cfg.provider].models.filter((id) => id !== cfg.model)].slice(0, 4);
  const alive = all.filter((m) => (dead.get(deadKey(cfg, m)) ?? 0) < Date.now());
  const chain = alive.length ? alive : [cfg.model];
  let last: unknown;
  for (let i = 0; i < chain.length; i++) {
    const left = deadline - Date.now();
    if (left <= 0) throw last ?? new Error("AI_TIMEOUT: quá thời gian chờ AI");
    // Mỗi model (trừ model cuối) chỉ được chờ attemptMs: Google thỉnh thoảng chậm 5-9s, chờ tiếp không bằng đổi model ngay.
    const cap = i + 1 < chain.length ? Math.min(left, opts.attemptMs ?? Infinity) : left;
    const ac = new AbortController(); // hủy request khi quá hạn: không hủy thì Google vẫn tính tiền lượt đó
    try {
      const run = askOne({ ...cfg, model: chain[i], signal: ac.signal }, system, turns, schema);
      if (cap === Infinity) return await run;
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { rej(new Error(cap < left ? "AI_SLOW: model trả lời quá chậm" : "AI_TIMEOUT: quá thời gian chờ AI")); ac.abort(); }, cap); });
      return await Promise.race([run, timeout]).finally(() => clearTimeout(timer));
    } catch (e) {
      if (/AI_TIMEOUT/.test(String(e))) throw last && isQuota(last) ? last : e;
      const quota = isQuota(e);
      if (!quota && !isOverload(e)) throw e;
      last = e;
      // Hết quota ngày: nhớ 1 giờ. 429 theo phút chỉ tạm thời (cả lớp dùng chung 1 key): nhớ 20 giây. Quá tải 503: 1 phút.
      dead.set(deadKey(cfg, chain[i]), Date.now() + (isLongQuota(e) ? 3_600_000 : quota || /AI_SLOW/.test(String(e)) ? 20_000 : 60_000));
      if (i + 1 < chain.length) cfg.onFallback?.(chain[i], chain[i + 1], String(e).slice(0, 120));
    }
  }
  throw last;
}

// Như askJson nhưng trả văn bản thuần (không ép JSON): dùng khi nội dung có nhiều dấu \ của LaTeX mà JSON hay làm hỏng.
// Cùng cơ chế hết hạn chót, đổi model khi hết quota hoặc quá tải; không tự kiểm tra định dạng, nơi gọi tự tách.
export async function askText(cfg0: LlmCfg, system: string, turns: Turn[], opts: { think?: boolean | "low"; maxTokens?: number; deadlineMs?: number; attemptMs?: number; use?: string; temperature?: number; seed?: number } = {}): Promise<string> {
  const cfg = { ...cfg0, ...opts };
  const deadline = Date.now() + (opts.deadlineMs ?? Infinity);
  const all = [cfg.model, ...PROVIDERS[cfg.provider].models.filter((id) => id !== cfg.model)].slice(0, 4);
  const alive = all.filter((m) => (dead.get(deadKey(cfg, m)) ?? 0) < Date.now());
  const chain = alive.length ? alive : [cfg.model];
  let last: unknown;
  for (let i = 0; i < chain.length; i++) {
    const left = deadline - Date.now();
    if (left <= 0) throw last ?? new Error("AI_TIMEOUT: quá thời gian chờ AI");
    const cap = i + 1 < chain.length ? Math.min(left, opts.attemptMs ?? Infinity) : left;
    const ac = new AbortController();
    try {
      const run = askOneText({ ...cfg, model: chain[i], signal: ac.signal }, system, turns);
      if (cap === Infinity) return await run;
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => { rej(new Error(cap < left ? "AI_SLOW: model trả lời quá chậm" : "AI_TIMEOUT: quá thời gian chờ AI")); ac.abort(); }, cap); });
      return await Promise.race([run, timeout]).finally(() => clearTimeout(timer));
    } catch (e) {
      if (/AI_TIMEOUT/.test(String(e))) throw last && isQuota(last) ? last : e;
      const quota = isQuota(e);
      if (!quota && !isOverload(e)) throw e;
      last = e;
      dead.set(deadKey(cfg, chain[i]), Date.now() + (isLongQuota(e) ? 3_600_000 : quota || /AI_SLOW/.test(String(e)) ? 20_000 : 60_000));
      if (i + 1 < chain.length) cfg.onFallback?.(chain[i], chain[i + 1], String(e).slice(0, 120));
    }
  }
  throw last;
}

async function askOneText(cfg: LlmCfg, system: string, turns: Turn[]): Promise<string> {
  const t0 = Date.now();
  const c = { ...cfg, onUsage: cfg.onUsage && ((u: Usage) => cfg.onUsage!({ ...u, ms: Date.now() - t0 })) };
  return withRetry(() => (c.provider === "openai" ? callOpenAI(c, system, turns, false) : callGemini(c, system, turns, undefined, true)));
}

async function askOne<T extends z.ZodType>(cfg: LlmCfg, system: string, turns: Turn[], schema: T): Promise<z.infer<T>> {
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = lastErr ? [...turns, { role: "user" as const, text: `JSON trước không hợp lệ (${lastErr}). Trả lại JSON đúng định dạng.` }] : turns;
    const t0 = Date.now();
    const c = { ...cfg, onUsage: cfg.onUsage && ((u: Usage) => cfg.onUsage!({ ...u, ms: Date.now() - t0 })) }; // ms: thời gian chờ AI của lượt gọi này
    const text = await withRetry(() => (c.provider === "openai" ? callOpenAI(c, system, t) : callGemini(c, system, t, schema)));
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
      // 429 / hết quota: không chờ, askJson đổi sang model khác ngay. Chỉ thử lại lỗi tạm thời (5xx, quá tải, mạng).
      if (i >= 1 || /PerDay|insufficient_quota|429|RESOURCE_EXHAUSTED/.test(s) || !/\b50\d\b|UNAVAILABLE|overload|fetch failed/i.test(s)) throw e;
      await new Promise((r) => setTimeout(r, 1500)); // thử lại đúng 1 lần, rồi askJson đổi model
    }
  }
}
