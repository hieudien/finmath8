import katex from "katex";
import "katex/dist/katex.min.css";
import { plain } from "@/lib/plain";

// Dựng công thức LaTeX nằm trong $...$ hoặc $$...$$ bằng KaTeX; phần chữ còn lại giữ nguyên.
// LaTeX sai cú pháp: KaTeX hiện nguyên mã (throwOnError=false), không làm vỡ trang. trust=false: không cho chạy lệnh nguy hiểm.
const MATH = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g; // công thức $...$ được xuống dòng bên trong (hệ phương trình nhiều dòng)

export function MathText({ text, className = "" }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH)) {
    if (m.index > last) parts.push(plain(text.slice(last, m.index)));
    const display = m[1] !== undefined;
    const html = katex.renderToString((m[1] ?? m[2]).trim(), { displayMode: display, throwOnError: false, trust: false, output: "html" });
    parts.push(<span key={m.index} className={display ? "block overflow-x-auto py-1" : undefined} dangerouslySetInnerHTML={{ __html: html }} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(plain(text.slice(last)));
  return <span className={`whitespace-pre-wrap ${className}`}>{parts}</span>;
}
