"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { costUsd, DEFAULT_PRICES, FALLBACK_PRICE, OTHER, RANGES, STUDENT, TEACHER, USD_VND, purposeInfo, type Range, type UsageRow } from "@/lib/pricing";

type Edit = { in: string; cached: string; out: string };
const KEY = "ai-prices-v1";
const nf = new Intl.NumberFormat("vi-VN");
const num = (s: string) => Math.max(0, Number(s.replace(",", ".")) || 0);
const cell = "min-h-11 w-24 rounded-sm border border-border-strong bg-surface px-2 text-right tnum";

const defaultEdit = (m: string): Edit => { const p = DEFAULT_PRICES[m] ?? FALLBACK_PRICE; return { in: String(p.in), cached: String(p.cached), out: String(p.out) }; };

export default function AiCost({ rows, range }: { rows: UsageRow[]; range: Range }) {
  const models = useMemo(() => [...new Set(rows.map((r) => r.model))].sort(), [rows]);
  // Giá đã sửa theo model; model chưa sửa (kể cả model mới xuất hiện khi đổi khoảng thời gian) dùng giá mặc định.
  const [prices, setPrices] = useState<Record<string, Edit>>({});
  const edit = (m: string) => prices[m] ?? defaultEdit(m);
  const [rate, setRate] = useState(String(USD_VND));

  // Giá đã chỉnh nhớ theo trình duyệt (localStorage); không có hoặc lỗi thì dùng giá ước tính mặc định.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as { prices?: Record<string, Edit>; rate?: string } | null;
      if (s?.prices) setPrices((cur) => ({ ...cur, ...s.prices }));
      if (s?.rate) setRate(s.rate);
    } catch {}
  }, []);
  const save = (p: Record<string, Edit>, r: string) => { try { localStorage.setItem(KEY, JSON.stringify({ prices: p, rate: r })); } catch {} };
  const setField = (m: string, k: keyof Edit, v: string) => { const p = { ...prices, [m]: { ...edit(m), [k]: v } }; setPrices(p); save(p, rate); };
  const setRateSave = (v: string) => { setRate(v); save(prices, v); };
  const reset = () => { setPrices({}); setRate(String(USD_VND)); save({}, String(USD_VND)); };

  const vnd = (r: UsageRow) => { const e = edit(r.model); return costUsd(r, { in: num(e.in), cached: num(e.cached), out: num(e.out) }) * num(rate); };

  const by = new Map<string, { label: string; group: string; calls: number; tokens: number; vnd: number }>();
  for (const r of rows) {
    const [label, group] = purposeInfo(r.use);
    const k = r.use || "?";
    const t = by.get(k) ?? { label, group, calls: 0, tokens: 0, vnd: 0 };
    t.calls += r.calls; t.tokens += r.input + r.output + (r.provider === "gemini" ? r.thoughts : 0); t.vnd += vnd(r);
    by.set(k, t);
  }
  const list = [...by.values()].sort((a, b) => b.vnd - a.vnd);
  const total = list.reduce((s, x) => ({ calls: s.calls + x.calls, tokens: s.tokens + x.tokens, vnd: s.vnd + x.vnd }), { calls: 0, tokens: 0, vnd: 0 });
  const tokIn = rows.reduce((s, r) => s + r.input, 0);

  return (
    <section aria-labelledby="ai-cost" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai-cost">Token đã dùng ({RANGES[range][2]} gần nhất)</h2>
        <nav aria-label="Khoảng thời gian" className="flex gap-1">
          {(Object.keys(RANGES) as Range[]).map((k) => (
            <Link key={k} href={`?range=${k}`} scroll={false} aria-current={k === range ? "true" : undefined} className={`inline-flex min-h-11 items-center rounded-sm border px-4 font-medium ${k === range ? "border-primary bg-primary-soft text-primary" : "border-border-strong bg-surface hover:bg-primary-soft"}`}>{RANGES[k][1]}</Link>
          ))}
        </nav>
      </div>
      {rows.length === 0 ? <p className="text-text-muted">Chưa có lượt gọi AI nào trong {RANGES[range][2]} qua.</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Số lượt gọi AI" value={nf.format(total.calls)} />
            <Stat label="Tổng token" value={nf.format(total.tokens)} note={`đầu vào ${nf.format(tokIn)}, còn lại là đầu ra`} />
            <Stat label="Ước tính tiền" value={`${nf.format(Math.round(total.vnd))} đ`} note="theo giá bên dưới" />
          </div>

          {[STUDENT, TEACHER, OTHER].map((g) => {
            const items = list.filter((x) => x.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left">
                  <caption className="mb-1 text-left font-medium">{g}</caption>
                  <thead className="text-sm text-text-muted"><tr><th className="py-1 pr-3 font-medium">Dùng làm gì</th><th className="px-3 text-right font-medium">Lượt</th><th className="px-3 text-right font-medium">Token</th><th className="pl-3 text-right font-medium">Tiền (đ)</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {items.map((x) => <tr key={x.label}><td className="py-2 pr-3">{x.label}</td><td className="tnum px-3 text-right">{nf.format(x.calls)}</td><td className="tnum px-3 text-right">{nf.format(x.tokens)}</td><td className="tnum pl-3 text-right">{nf.format(Math.round(x.vnd))}</td></tr>)}
                  </tbody>
                </table>
              </div>
            );
          })}

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <h3>Giá để tính tiền</h3>
            <p className="text-sm text-text-muted">Đây là giá ước tính (USD cho 1 triệu token). Hãy chỉnh theo bảng giá thật của nhà cung cấp, tiền ở trên tự tính lại. Giá lưu trong trình duyệt này.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left">
                <thead className="text-sm text-text-muted"><tr><th className="py-1 pr-3 font-medium">Model</th><th className="px-2 text-right font-medium">Đầu vào</th><th className="px-2 text-right font-medium">Đầu vào đã cache</th><th className="pl-2 text-right font-medium">Đầu ra</th></tr></thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m}>
                      <td className="py-1 pr-3 font-mono text-sm">{m}</td>
                      {(["in", "cached", "out"] as const).map((k) => <td key={k} className="px-2 py-1 text-right"><input inputMode="decimal" aria-label={`${m} ${k === "in" ? "đầu vào" : k === "cached" ? "đầu vào đã cache" : "đầu ra"}`} className={cell} value={edit(m)[k]} onChange={(e) => setField(m, k, e.target.value)} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex flex-wrap items-center gap-2">Tỷ giá 1 USD =
              <input inputMode="numeric" aria-label="Tỷ giá USD sang đồng" className={cell} value={rate} onChange={(e) => setRateSave(e.target.value)} /> đ
            </label>
            <div><Button variant="secondary" onClick={reset}>Về giá mặc định</Button></div>
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="tnum text-2xl font-semibold">{value}</p>
      {note && <p className="text-sm text-text-muted">{note}</p>}
    </div>
  );
}
