"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui";
import { reportClient } from "@/components/ClientErrors";

const CONTACT = process.env.NEXT_PUBLIC_ADMIN_CONTACT;

export default function ErrorView({ error, reset, student = false }: { error: Error & { digest?: string }; reset: () => void; student?: boolean }) {
  // Lỗi có digest đã được server ghi (instrumentation.ts); lỗi chỉ xảy ra trên trình duyệt thì báo về đây.
  useEffect(() => { if (!error.digest) reportClient(error.message, error.stack); }, [error]);
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-4 px-4 py-8">
      <h1>Có lỗi xảy ra</h1>
      <p>
        {student
          ? "Trang tạm thời không mở được. Em thử tải lại. Nếu vẫn lỗi, em báo giáo viên."
          : "Hệ thống chưa xử lý được yêu cầu này. Bạn thử lại sau ít phút. Dữ liệu đã lưu trước đó vẫn an toàn."}
      </p>
      {!student && <p className="text-text-muted">Nếu lỗi lặp lại, hãy liên hệ quản trị viên{CONTACT ? `: ${CONTACT}` : ""}.</p>}
      {error.digest && <p className="text-sm text-text-muted">Mã lỗi: <span className="tnum font-medium">{error.digest}</span>{student ? "" : ". Gửi kèm mã này cho quản trị viên."}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Thử lại</Button>
        {!student && <a href="/dashboard" className="inline-flex min-h-11 items-center rounded-sm border border-border-strong px-4 font-medium hover:bg-primary-soft">Về trang tổng quan</a>}
      </div>
    </main>
  );
}
