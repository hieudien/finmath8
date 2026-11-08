"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui";

const Dialog = dynamic(() => import("@/components/FormulaDialog"), { ssr: false });

// Nút "Công thức": mở hộp soạn, chèn $latex$ vào textarea tại vị trí con trỏ.
export default function FormulaButton({ target, value, onChange, disabled }: { target: React.RefObject<HTMLTextAreaElement | null>; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<[number, number]>([0, 0]);

  function show() {
    const el = target.current;
    setAt(el ? [el.selectionStart, el.selectionEnd] : [value.length, value.length]);
    setOpen(true);
  }
  function insert(latex: string) {
    const [a, b] = at;
    onChange(value.slice(0, a) + `$${latex}$` + value.slice(b));
  }
  return (
    <>
      <Button variant="secondary" type="button" onClick={show} disabled={disabled} aria-label="Chèn công thức toán" className="px-3 text-sm">∑ Công thức</Button>
      {open && <Dialog onInsert={insert} onClose={() => { setOpen(false); target.current?.focus(); }} />}
    </>
  );
}
