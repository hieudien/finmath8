// Đổi LaTeX thường gặp sang chữ thường dễ đọc: giao diện không dựng công thức nên "$Ay = B$" sẽ hiện nguyên dấu $.
const SYM: Record<string, string> = { neq: "≠", Leftrightarrow: "⇔", Rightarrow: "⇒", rightarrow: "→", leq: "≤", le: "≤", geq: "≥", ge: "≥", times: "×", cdot: "·", div: "÷", approx: "≈", pm: "±", infty: "∞", pi: "π", ldots: "…", dots: "…" };
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", n: "ⁿ" };

export function plain(t: string) {
  return t
    .replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_, b: string) => "Hệ: " + b.split(/\\\\/).map((x) => x.trim()).filter(Boolean).join("; "))
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]*)\}/g, "√($1)")
    .replace(/\^\{?([0-9n])\}?/g, (_, d: string) => SUP[d])
    .replace(/\\([A-Za-z]+)/g, (m, k: string) => SYM[k] ?? m.slice(1))
    .replace(/\\%/g, "%")
    .replace(/\$+/g, "")
    .replace(/[{}]/g, "");
}
