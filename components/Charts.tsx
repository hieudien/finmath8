"use client";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { plain } from "@/lib/plain";

type D = { name: string; value: number }[];
const axis = { fill: "var(--color-text-muted)", fontSize: 12 };

export function BarBox({ data: raw, max, horizontal }: { data: D; max?: number; horizontal?: boolean }) {
  const data = raw.map((d) => ({ ...d, name: plain(d.name) })); // nhãn biểu đồ không dựng được KaTeX: đổi LaTeX sang chữ thường
  if (!data.length) return <p className="text-sm text-text-muted">Chưa có dữ liệu.</p>;
  return (
    <div className="w-full" style={{ height: horizontal ? 40 + data.length * 36 : 220 }} role="img" aria-label={data.map((d) => `${d.name}: ${d.value}`).join("; ")}>
      <ResponsiveContainer>
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: horizontal ? 24 : 0, right: 16, top: 8 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={!horizontal} horizontal={!!horizontal ? false : true} />
          {horizontal ? <YAxis type="category" dataKey="name" width={140} tick={axis} /> : <XAxis dataKey="name" tick={axis} />}
          {horizontal ? <XAxis type="number" allowDecimals={false} tick={axis} domain={[0, max ?? "auto"]} /> : <YAxis allowDecimals={false} tick={axis} domain={[0, max ?? "auto"]} width={32} />}
          <Tooltip cursor={{ fill: "var(--color-primary-soft)" }} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 6 }} />
          <Bar dataKey="value" name="Giá trị" fill="var(--color-primary)" radius={[3, 3, 0, 0]} label={{ position: horizontal ? "right" : "top", fill: "var(--color-text)", fontSize: 12 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineBox({ data }: { data: D }) {
  if (!data.length) return <p className="text-sm text-text-muted">Chưa có dữ liệu.</p>;
  return (
    <div className="h-56 w-full" role="img" aria-label={data.map((d) => `${d.name}: ${d.value} phiên`).join("; ")}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ right: 16, top: 8 }}>
          <CartesianGrid stroke="var(--color-border)" />
          <XAxis dataKey="name" tick={axis} />
          <YAxis allowDecimals={false} tick={axis} width={32} />
          <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 6 }} />
          <Line type="monotone" dataKey="value" name="Phiên" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
