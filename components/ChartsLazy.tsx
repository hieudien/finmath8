"use client";
import dynamic from "next/dynamic";

// recharts nặng: tách khỏi bundle đầu trang, tải sau khi trang đã hiện.
const loading = () => <div className="skeleton h-56 w-full" />;
export const BarBox = dynamic(() => import("./Charts").then((m) => m.BarBox), { ssr: false, loading });
export const LineBox = dynamic(() => import("./Charts").then((m) => m.LineBox), { ssr: false, loading });
