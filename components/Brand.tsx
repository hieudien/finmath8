// Dấu hiệu thương hiệu FinMath 8: ô vuông xanh "F8" + tên. Dùng chung cho landing, đăng nhập, chat học sinh.
export default function Brand({ size = "md", tagline = false }: { size?: "sm" | "md"; tagline?: boolean }) {
  const box = size === "sm" ? "size-7 text-xs" : "size-9 text-sm";
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className={`grid ${box} shrink-0 place-items-center rounded-sm bg-primary font-bold text-on-primary`}>F8</span>
      <span className="leading-tight">
        <span className="block font-bold text-text">FinMath 8</span>
        {tagline && <span className="block text-xs text-text-muted">Trợ lý học Toán lớp 8</span>}
      </span>
    </span>
  );
}
