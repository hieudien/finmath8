"use client";
import { useId, useRef } from "react";
import FormulaButton from "@/components/FormulaButton";
import { MathText } from "@/components/MathText";

// Ô nhiều dòng có nút chèn công thức và xem trước công thức đã dựng (cho giáo viên soạn đề).
export default function MathTextArea({ label, hint, value, onChange, rows = 3 }: { label: string; hint?: string; value: string; onChange: (v: string) => void; rows?: number }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">{label}</label>
      <textarea id={id} ref={ref} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-11 w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-text" />
      <div><FormulaButton target={ref} value={value} onChange={onChange} /></div>
      {value.trim() && <div className="rounded-sm border border-border bg-primary-soft px-3 py-2 text-sm"><span className="block text-xs text-text-muted">Xem trước</span><MathText text={value} /></div>}
      {hint && <p className="text-sm text-text-muted">{hint}</p>}
    </div>
  );
}
