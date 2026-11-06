import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Giữ trang động đã xem trong bộ nhớ trình duyệt 30 giây: quay lại menu vừa mở thì hiện ngay.
  // Sau khi lưu dữ liệu, các form gọi router.refresh() nên số liệu vẫn mới.
  experimental: { staleTimes: { dynamic: 30 } },
};

export default nextConfig;
