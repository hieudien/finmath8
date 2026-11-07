// Gemini tính hạn mức theo ngày Pacific (reset 00:00 giờ Pacific). Lấy mốc 00:00 gần nhất để đếm "hôm nay".
export function windowStart(now = new Date()) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return new Date(now.getTime() - (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000);
}

type Row = { action: string; ts?: string; meta: { model?: string; in?: number; out?: number } };

export function summarizeUsage(rows: Row[]) {
  const by = new Map<string, number>();
  let calls = 0, inTok = 0, outTok = 0, throttled = 0;
  let hitAt = null as string | null;
  for (const r of rows) {
    if (r.action === "quota_hit") { if (r.ts && (!hitAt || r.ts > hitAt)) hitAt = r.ts; continue; }
    if (r.action === "model_fallback") { throttled++; continue; }
    calls++; inTok += r.meta.in ?? 0; outTok += r.meta.out ?? 0;
    by.set(r.meta.model ?? "?", (by.get(r.meta.model ?? "?") ?? 0) + 1);
  }
  return { calls, inTok, outTok, throttled, hitAt, byModel: [...by.entries()].sort((a, b) => b[1] - a[1]) };
}
