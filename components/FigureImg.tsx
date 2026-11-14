// Hình vẽ của đề: bấm vào để mở ảnh gốc ở thẻ mới (phóng to bằng cử chỉ trên điện thoại).
export default function FigureImg({ src, className = "" }: { src: string; className?: string }) {
  return (
    <a href={src} target="_blank" rel="noreferrer" className="inline-block max-w-full" aria-label="Hình vẽ của đề, bấm để phóng to">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Hình vẽ của đề" loading="lazy" className={`max-h-72 max-w-full rounded-sm border border-border bg-white ${className}`} />
    </a>
  );
}
