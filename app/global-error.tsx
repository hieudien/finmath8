"use client";

// Lỗi ở tầng ngoài cùng (layout hỏng): không dùng được CSS của app, nên viết kiểu tối giản.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="vi">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 480, margin: "0 auto", lineHeight: 1.5 }}>
        <h1>Có lỗi xảy ra</h1>
        <p>Hệ thống đang gặp sự cố. Bạn tải lại trang sau ít phút. Nếu vẫn lỗi, hãy liên hệ quản trị viên.</p>
        <button onClick={reset} style={{ minHeight: 44, padding: "0 16px", fontSize: 16 }}>Thử lại</button>
      </body>
    </html>
  );
}
