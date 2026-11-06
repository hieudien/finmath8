const Bar = ({ w = "100%", h = "h-5" }: { w?: string; h?: string }) => <div className={`skeleton ${h}`} style={{ width: w }} />;

function Wrap({ children, label }: { children: React.ReactNode; label: string }) {
  return <div className="flex flex-col gap-6" aria-busy="true" aria-label={label} role="status">{children}</div>;
}

export function ListSkeleton({ title = "Đang tải", rows = 4, form = false }: { title?: string; rows?: number; form?: boolean }) {
  return (
    <Wrap label={title}>
      <Bar w="12rem" h="h-8" />
      {form && (
        <div className="rounded-lg border border-border bg-surface p-4 md:p-6">
          <div className="flex flex-col gap-3"><Bar w="40%" /><Bar h="h-24" /><Bar w="9rem" h="h-11" /></div>
        </div>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex flex-col gap-2 px-4 py-3"><Bar w={`${70 - i * 6}%`} /><Bar w="45%" h="h-4" /></li>
        ))}
      </ul>
    </Wrap>
  );
}

export function StatsSkeleton() {
  return (
    <Wrap label="Đang tải thống kê">
      <Bar w="10rem" h="h-8" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col gap-2"><Bar w="60%" h="h-4" /><Bar w="40%" h="h-8" /></div>)}
      </div>
      <div className="skeleton h-56 w-full" />
      <div className="skeleton h-40 w-full" />
    </Wrap>
  );
}

export function FormSkeleton() {
  return (
    <Wrap label="Đang tải cài đặt">
      <Bar w="9rem" h="h-8" />
      <div className="flex max-w-2xl flex-col gap-4">
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-16 w-full" />
        <Bar w="50%" />
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-14 w-full" />
      </div>
    </Wrap>
  );
}
