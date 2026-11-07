import katex from "katex";
import { plain } from "@/lib/plain";

const MATH = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g; // cùng quy tắc với components/MathText.tsx
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Bản chuỗi HTML của MathText, cho route API (không dùng react-dom/server). Chữ thường được escape, công thức do KaTeX dựng (trust=false).
export function mathHtml(text: string) {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(MATH)) {
    if (m.index > last) out += esc(plain(text.slice(last, m.index)));
    const display = m[1] !== undefined;
    const html = katex.renderToString((m[1] ?? m[2]).trim(), { displayMode: display, throwOnError: false, trust: false, output: "html" });
    out += display ? `<span class="block overflow-x-auto py-1">${html}</span>` : html;
    last = m.index + m[0].length;
  }
  return out + esc(plain(text.slice(last)));
}
