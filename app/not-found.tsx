import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-4 px-4 py-8">
      <h1>Không tìm thấy trang</h1>
      <p className="text-text-muted">Đường dẫn có thể đã gõ sai hoặc trang đã bị xóa. Nếu em đang mở liên kết của giáo viên, hãy hỏi lại giáo viên.</p>
      <LinkButton href="/" className="self-start">Về trang chủ</LinkButton>
    </main>
  );
}
