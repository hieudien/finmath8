"use client";
import { useRouter } from "next/navigation";
import { Confirm, post } from "@/components/ui";

export default function StudentDelete({ code }: { code: string }) {
  const router = useRouter();
  return (
    <Confirm label="Xóa học sinh" message="Học sinh bị ẩn khỏi danh sách. Bài làm, tin nhắn và điểm vẫn được giữ. Nếu em vào bài lại bằng cùng mã, học sinh sẽ hiện lại." onConfirm={async () => {
      const { ok, data } = await post("/api/students", { action: "delete", code });
      if (!ok) return data.error ?? "Có lỗi.";
      router.push("/dashboard/students");
    }} />
  );
}
