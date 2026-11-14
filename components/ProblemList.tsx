"use client";
import { useState } from "react";
import { Alert, Badge, Empty } from "@/components/ui";
import { ProblemActions } from "@/components/ProblemTools";
import { ExplainButton } from "@/components/ProblemViewTools";
import { ListSearch } from "@/components/ListSearch";
import { matchText } from "@/lib/search";
import { ProblemFilter } from "@/components/ProblemFilter";
import { matchClass, NO_FILTER, type Filter } from "@/lib/problem-filter";
import { BRANCHES, type Branch } from "@/lib/taxonomy";

// Dữ liệu đã tính ở server (readiness, missingInfo) để danh sách chỉ lo hiển thị, cuộn và tìm.
export type ProblemItem = {
  id: string; code: string; title: string; grade: number; topic: string; branch?: Branch; version: number; updated: string;
  unconfirmed: boolean; lint: string[]; needGuides: boolean; pending: boolean; missing: string[]; hay: string;
};

export function ProblemList({ items }: { items: ProblemItem[] }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>(NO_FILTER);
  const shown = items.filter((r) => matchClass(r, f) && matchText(r.hay, q));
  return (
    <div className="flex flex-col gap-2">
      <ProblemFilter items={items} value={f} onChange={setF} />
      <ListSearch value={q} onChange={setQ} shown={shown.length} total={items.length} />
      {shown.length === 0 ? <Empty text="Không có đề nào khớp." /> : (
        <ul className="max-h-[70dvh] divide-y divide-border overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface">
          {shown.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="w-96 max-w-full shrink-0">
                <div className="flex items-center gap-2" title={`${r.code} ${r.title}`}>
                  <p className="min-w-0 truncate font-medium"><span className="tnum text-text-muted">{r.code}</span> {r.title}</p>
                  <span className="shrink-0"><Badge tone="info">Lớp {r.grade}</Badge></span>
                  {r.branch && <span className="shrink-0"><Badge tone="neutral">{BRANCHES[r.branch]}</Badge></span>}
                  {r.unconfirmed && <span className="shrink-0"><Badge tone="warn">Chưa xác nhận đáp án</Badge></span>}
                </div>
                <p className="truncate text-sm text-text-muted">{r.topic} · v{r.version} · {r.updated}</p>
              </div>
              <ProblemActions id={r.id} />
              {(r.needGuides || r.pending || r.lint.length > 0) && (
                <div className="flex basis-full flex-wrap gap-1">
                  {r.lint.length > 0 && <Badge tone="warn"><span title={r.lint.join("\n")}>Cần xem lại ({r.lint.length})</span></Badge>}
                  {r.needGuides && <Badge tone="warn">Cần chuẩn hóa lại</Badge>}
                  {r.pending && <Badge tone="warn">Chưa hoàn thiện</Badge>}
                </div>
              )}
              {r.missing.length > 0 && (
                <div className="flex basis-full flex-col gap-2">
                  <Alert tone="warning">Thiếu {r.missing.join(", ")}, nên chưa tạo được liên kết với đề này. Liên kết đã tạo trước đó giữ đề cũ: tạo liên kết mới sau khi bổ sung.</Alert>
                  <ExplainButton id={r.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
