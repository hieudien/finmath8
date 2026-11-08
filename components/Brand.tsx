// Dấu hiệu thương hiệu MathStep AI: ô vuông xanh "MS" + tên. Dùng chung cho landing, đăng nhập, chat học sinh.
export default function Brand({ size = "md", tagline = false }: { size?: "sm" | "md"; tagline?: boolean }) {
  const box = size === "sm" ? "size-7 text-xs" : "size-9 text-sm";
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className={`grid ${box} shrink-0 place-items-center rounded-sm bg-primary font-bold text-on-primary`}>MS</span>
      <span className="leading-tight">
        <span className="block font-bold text-text">MathStep AI</span>
        {tagline && <span className="block text-xs text-text-muted">Trợ lý học Toán từng bước</span>}
      </span>
    </span>
  );
}
