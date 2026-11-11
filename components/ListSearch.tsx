"use client";
import { Field } from "@/components/ui";

// Ô tìm theo chữ dùng chung cho các danh sách dài; lọc làm ở nơi dùng (client), không gọi server.
export function ListSearch({ value, onChange, shown, total }: { value: string; onChange: (v: string) => void; shown: number; total: number }) {
  return (
    <div className="flex flex-col gap-1">
      <Field label="Tìm theo chữ" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Mã, tiêu đề, chủ đề hoặc nội dung đề" autoComplete="off" />
      <p aria-live="polite" className="text-sm text-text-muted">{value.trim() ? `Hiện ${shown}/${total}` : `${total} mục`}</p>
    </div>
  );
}
