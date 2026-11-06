import AuthForm from "@/components/AuthForm";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthForm mode="login" notice={error === "link" ? "Liên kết trong email đã hết hạn hoặc đã dùng. Hãy yêu cầu liên kết mới." : error === "server" ? "Hệ thống đang bận hoặc mất kết nối. Chờ vài phút rồi đăng nhập lại. Nếu vẫn lỗi, hãy liên hệ quản trị viên." : undefined} />;
}
