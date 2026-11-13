"use client";
import { useEffect, useRef } from "react";
import { Button, toast } from "@/components/ui";

// Hộp soạn công thức (MathLive). Tải thư viện khi mở hộp. Trả về LaTeX qua onInsert; callers bọc trong $...$.
export default function FormulaDialog({ initial = "", onInsert, onClose }: { initial?: string; onInsert: (latex: string) => void; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<{ getValue: () => string; focus: () => void } | null>(null);

  useEffect(() => {
    let gone = false;
    const box = host.current;
    import("mathlive").then(({ MathfieldElement }) => {
      if (gone || !host.current) return;
      MathfieldElement.fontsDirectory = "/mathlive-fonts"; // chép từ node_modules/mathlive/fonts vào public/
      MathfieldElement.soundsDirectory = null;
      // Toán cấp 2: chỉ giữ số, phép tính, phân số, mũ, căn, so sánh. Không tích phân, giới hạn, chữ Hy Lạp, ma trận.
      // 4 khu cách nhau bằng phím trống: biến + so sánh | số | phép tính | cấu trúc (mỗi khu một sắc nền, xem globals.css)
      const k = (latex: string, cls: string, insert = latex) => ({ latex, insert, class: cls });
      const cmp = (l: string, i = l) => k(l, "zn-cmp", i);
      const op = (l: string, i = l) => k(l, "zn-op", i);
      const st = (l: string, i = l) => k(l, "zn-st", i);
      const gap = { class: "separator w5" };
      const gap2 = { class: "separator w20" };
      window.mathVirtualKeyboard.layouts = [{
        label: "Toán", tooltip: "Bàn phím toán cấp 2",
        rows: [
          [cmp("x"), cmp("y"), cmp("a"), cmp("b"), gap, "[7]", "[8]", "[9]", gap, op("+"), op("-"), gap, st("\\frac{#@}{#?}"), st("\\sqrt{#?}")],
          [cmp("<"), cmp(">"), cmp("\\le"), cmp("\\ge"), gap, "[4]", "[5]", "[6]", gap, op("\\times"), op("\\div"), gap, st("#@^2"), st("#@^{#?}")],
          [cmp("\\ne"), cmp("="), cmp("\\pi"), cmp("^\\circ"), gap, "[1]", "[2]", "[3]", gap, op("("), op(")"), gap, { label: "hệ PT", insert: "\\begin{cases}#?\\\\#?\\end{cases}", class: "zn-st small w20", tooltip: "Hệ phương trình" }],
          ["[left]", "[right]", cmp("\\%"), cmp(","), gap, "[0]", "[.]", "[backspace]", gap, gap2, gap, gap2],
        ],
      }];
      const mf = new MathfieldElement();
      mf.value = initial;
      mf.style.cssText = "display:block;width:100%;font-size:1.5rem;padding:0.5rem;border:1px solid var(--color-border-strong,#888);border-radius:6px;";
      host.current.appendChild(mf);
      mf.inlineShortcuts = { sqrt: "\\sqrt{#?}", pi: "\\pi", sin: "\\sin", cos: "\\cos", tan: "\\tan", cot: "\\cot", "<=": "\\le", ">=": "\\ge", "!=": "\\ne" };
      mf.menuItems = []; // ẩn menu chuột phải (chỉ gán được sau khi đã gắn vào trang)
      field.current = mf;
      mf.focus();
    }).catch(() => toast("danger", "Không tải được bộ soạn công thức. Bạn gõ công thức dạng $...$ cũng được."));
    return () => { gone = true; box?.replaceChildren(); window.mathVirtualKeyboard?.hide(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insert = () => {
    const v = field.current?.getValue().trim();
    if (v) onInsert(v);
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Soạn công thức" className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="mt-8 flex w-full max-w-lg flex-col gap-3 rounded-lg bg-surface p-4 shadow-lg">
        <h2 className="text-lg">Soạn công thức</h2>
        <p className="text-sm text-text-muted">Gõ trực tiếp hoặc dùng bàn phím công thức. Gõ <code>/</code> để tạo phân số, <code>^</code> để viết số mũ, <code>sqrt</code> để viết căn. Phím <code>{"{"}</code> hai dòng để nhập hệ phương trình.</p>
        <div ref={host} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Hủy</Button>
          <Button type="button" onClick={insert}>Chèn</Button>
        </div>
      </div>
    </div>
  );
}
