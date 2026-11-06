import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const font = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "FinMath 8",
  description: "Chatbot gợi mở giúp học sinh lớp 8 giải bài Toán tình huống tài chính.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${font.variable} antialiased`}>{children}</body>
    </html>
  );
}
