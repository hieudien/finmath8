import Link from "next/link";

// Hai tab của mục Đề bài: danh sách đề và tạo đề hàng loạt (đều là trang riêng nên dùng liên kết).
export function ProblemsTabs({ current }: { current: "list" | "bulk" }) {
  const cls = (on: boolean) => `inline-flex min-h-11 items-center border-b-2 px-4 font-medium ${on ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text"}`;
  return (
    <nav aria-label="Mục Đề bài" className="flex border-b border-border">
      <Link href="/dashboard/problems" aria-current={current === "list" ? "page" : undefined} className={cls(current === "list")}>Danh sách đề</Link>
      <Link href="/dashboard/problems/bulk" aria-current={current === "bulk" ? "page" : undefined} className={cls(current === "bulk")}>Tạo đề hàng loạt</Link>
    </nav>
  );
}
