"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Brand from "@/components/Brand";
import { Alert, Button, Field, post } from "@/components/ui";

type Mode = "login" | "register" | "forgot" | "reset";
const CFG: Record<Mode, { title: string; submit: string; busy: string; url: string }> = {
  login: { title: "Đăng nhập", submit: "Đăng nhập", busy: "Đang đăng nhập...", url: "/api/auth/login" },
  register: { title: "Đăng ký giáo viên", submit: "Tạo tài khoản", busy: "Đang gửi email...", url: "/api/auth/register" },
  forgot: { title: "Quên mật khẩu", submit: "Gửi liên kết", busy: "Đang gửi email...", url: "/api/auth/forgot" },
  reset: { title: "Đặt mật khẩu mới", submit: "Lưu mật khẩu", busy: "Đang lưu...", url: "/api/auth/reset" },
};
const A = "min-h-11 py-3 text-primary underline";

export default function AuthForm({ mode, notice }: { mode: Mode; notice?: string }) {
  const c = CFG[mode];
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr("");
    const { ok, data } = await post(c.url, { email: f.get("email"), password: f.get("password") });
    setBusy(false);
    if (!ok) return setErr(data.error ?? "Có lỗi xảy ra.");
    if (mode === "login" || mode === "reset") {
      router.replace("/dashboard");
      router.refresh(); // xóa bộ nhớ đệm trang của phiên cũ
      return;
    }
    setSent(mode === "register" ? "Đã gửi email xác nhận. Mở email và bấm nút xác nhận để kích hoạt tài khoản." : "Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi.");
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <Link href="/" aria-label="MathStep AI, về trang chủ"><Brand /></Link>
      <h1>{c.title}</h1>
      {notice && <Alert tone="warning">{notice}</Alert>}
      {sent ? (
        <Alert tone="success">{sent}</Alert>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode !== "reset" && <Field label="Email" name="email" type="email" inputMode="email" autoComplete="email" required />}
          {mode !== "forgot" && (
            <Field
              label={mode === "reset" ? "Mật khẩu mới" : "Mật khẩu"}
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "login" ? undefined : 8}
              hint={mode === "login" ? undefined : "Tối thiểu 8 ký tự"}
              required
            />
          )}
          {err && <Alert tone="danger">{err}</Alert>}
          <Button type="submit" pending={busy ? c.busy : undefined}>{c.submit}</Button>
        </form>
      )}
      <nav className="flex flex-col text-sm">
        {mode !== "login" && <a className={A} href="/login">Đã có tài khoản? Đăng nhập</a>}
        {mode !== "register" && <a className={A} href="/register">Chưa có tài khoản? Đăng ký</a>}
        {mode === "login" && <a className={A} href="/forgot">Quên mật khẩu</a>}
      </nav>
    </main>
  );
}
