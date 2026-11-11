import { redirect } from "next/navigation";

// Lịch sử nạp đề đã gộp vào tab Tạo đề hàng loạt; giữ đường dẫn cũ để liên kết cũ vẫn dùng được.
export default function Page() {
  redirect("/dashboard/problems/bulk");
}
