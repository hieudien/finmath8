"use client";
import { useId } from "react";
import { BRANCHES, BRANCH_KEYS } from "@/lib/taxonomy";
import { facets, isFiltering, type Cls, type Filter, NO_FILTER } from "@/lib/problem-filter";

const SEL = "min-h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-text";

function Sel({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={SEL}>{children}</select>
    </div>
  );
}

// Ba ô lọc Lớp, Nhánh, Chủ đề; đổi lớp hoặc nhánh thì bỏ chủ đề đã chọn (có thể không còn thuộc phạm vi mới).
export function ProblemFilter({ items, value, onChange }: { items: Cls[]; value: Filter; onChange: (f: Filter) => void }) {
  const { grades, topics } = facets(items, value);
  return (
    <div className="flex flex-col gap-1">
      <div className="grid gap-3 sm:grid-cols-3">
        <Sel label="Lớp" value={value.grade} onChange={(grade) => onChange({ ...value, grade, topic: "" })}>
          <option value="">Tất cả lớp</option>
          {grades.map((g) => <option key={g} value={g}>Lớp {g}</option>)}
        </Sel>
        <Sel label="Đại số / Hình học" value={value.branch} onChange={(branch) => onChange({ ...value, branch, topic: "" })}>
          <option value="">Tất cả</option>
          {BRANCH_KEYS.map((k) => <option key={k} value={k}>{BRANCHES[k]}</option>)}
          <option value="none">Chưa phân loại</option>
        </Sel>
        <Sel label="Chủ đề" value={value.topic} onChange={(topic) => onChange({ ...value, topic })}>
          <option value="">Tất cả chủ đề</option>
          {topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </Sel>
      </div>
      {isFiltering(value) && <button type="button" onClick={() => onChange(NO_FILTER)} className="inline-flex min-h-11 w-fit items-center text-sm text-primary underline">Bỏ lọc</button>}
    </div>
  );
}
