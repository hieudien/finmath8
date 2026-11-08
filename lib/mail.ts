import nodemailer from "nodemailer";

const tx = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_SMTP_USER, pass: process.env.GMAIL_SMTP_APP_PASSWORD },
  });

export async function sendLinkMail(to: string, kind: "signup" | "recovery", link: string) {
  const signup = kind === "signup";
  const subject = signup ? "Xác nhận tài khoản MathStep AI" : "Đặt lại mật khẩu MathStep AI";
  const action = signup ? "Xác nhận email" : "Đặt mật khẩu mới";
  await tx().sendMail({
    from: `MathStep AI <${process.env.GMAIL_SMTP_USER}>`,
    to,
    subject,
    text: `${action}: ${link}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;line-height:1.5">
<p>${signup ? "Cảm ơn bạn đã đăng ký MathStep AI." : "Bạn vừa yêu cầu đặt lại mật khẩu."}</p>
<p><a href="${link}" style="display:inline-block;background:#0f5c4d;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">${action}</a></p>
<p style="color:#555;font-size:13px">Nếu nút không bấm được, mở liên kết: ${link}<br>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p></div>`,
  });
}
