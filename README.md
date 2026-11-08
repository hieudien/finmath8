# MathStep AI

Chatbot gợi mở giúp học sinh lớp 8 tự giải các bài Toán tình huống tài chính (tiết kiệm, khuyến mãi, lãi suất, trả góp, ngân sách...).

Chatbot **không đưa đáp án**. Nó hỏi từng bước theo cách giải quyết vấn đề của Polya, tăng gợi ý theo 3 mức khi học sinh kẹt, và chỉ kết thúc bài khi học sinh đã nêu kết quả cùng cách làm. Giáo viên nạp đề, tạo liên kết công khai và xem thống kê theo từng học sinh. Học sinh vào bằng liên kết, chỉ nhập mã và tên, không cần tài khoản.

## Cách hoạt động

1. Giáo viên đăng ký, nhập API key của Google Gemini hoặc OpenAI trong Cài đặt (key được mã hóa AES-256-GCM, không trả về trình duyệt).
2. Giáo viên nạp đề bằng JSON hoặc dán văn bản để AI chuẩn hóa. Khi nạp đề, AI cũng tạo sẵn câu chào đầu tiên cho bài.
3. Giáo viên chọn một hoặc nhiều đề, tạo liên kết công khai và gửi cho học sinh.
4. Học sinh chọn đề, chat với bot, có thể quay lại danh sách đề, và đánh giá chatbot cuối bài.
5. Hệ thống chấm năng lực theo 4 tiêu chí (nhận diện, lập kế hoạch, tính toán, giải thích), giáo viên xem thống kê và nội dung hội thoại đã lọc thông tin cá nhân.

## Tính năng

**Giáo viên**
- Nạp đề: JSON (kiểm tra bằng Zod, báo lỗi theo trường) hoặc văn bản thô chuẩn hóa bằng AI, có xem trước và chỉnh sửa. Đề mẫu TC01–TC10 có sẵn (`de-mau-10.json`).
- AI tạo lời giải từng bước và câu chào đầu tiên cho đề; kiểm tra lời giải khớp đáp án.
- Kiểm thử chatbot cho từng đề: không lộ đáp án, che thông tin cá nhân, kéo học sinh về bài, không xác nhận đáp án sai, tăng gợi ý dần, ghi nhận khi làm đúng, hỏi cách làm khi chỉ có đáp số.
- Liên kết công khai: bật/tắt, hạn dùng, giới hạn số tin, nhãn nhóm (trước, sau, thực nghiệm, đối chứng).
- Thống kê: số phiên, tỉ lệ hoàn thành, điểm rubric, lỗi thường gặp, mức gợi ý, so sánh giữa các nhóm, xem hội thoại từng phiên. Xuất CSV.
- Nhật ký hoạt động chỉ thêm, không sửa; hướng dẫn sử dụng cho giáo viên.

**Học sinh**
- Không cần tài khoản, không hỏi tên, lớp hay trường.
- Câu chào hiện ngay khi mở bài; bot hỏi một câu cụ thể mỗi lượt.
- Công thức hiển thị bằng KaTeX.

**Chat engine** ([lib/chat](lib/chat))
- Tiến độ theo mốc lời giải; server tự xác minh mốc có số, mốc còn lại cần trích dẫn nguyên văn từ tin của học sinh.
- Chỉ kết thúc khi đủ mốc và học sinh đã trình bày cách làm (`method_ok`, server kiểm tra bằng chứng).
- Chặn lộ đáp án: nếu câu trả lời của bot chứa số kết quả học sinh chưa nêu, AI viết lại.
- Chặn đổi vai và lấy prompt, lọc thông tin cá nhân trước khi lưu và trước khi gửi AI.
- Tự đổi sang model khác của cùng nhà cung cấp khi hết lượt hoặc quá tải.

## Công nghệ

- Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4
- Supabase: Postgres, Auth, RLS
- Google Gemini (`@google/genai`) hoặc OpenAI, dùng key của giáo viên
- Zod, KaTeX, Recharts, simple-statistics, Nodemailer (Gmail SMTP)
- Vitest

## Cấu trúc thư mục

```
app/
  page.tsx                  trang giới thiệu
  (auth)/                   đăng ký, đăng nhập, quên và đặt lại mật khẩu
  dashboard/                tổng quan, đề, liên kết, thống kê, nhật ký, cài đặt, hướng dẫn
  c/[slug]/                 trang chat của học sinh
  api/                      auth, chat, chat-log, export, links, problems, settings
components/                 giao diện (Chat, ProblemTools, ...)
lib/
  chat/                     engine, prompt, tiến độ, kiểm thử chatbot
  schema/problem.ts         schema Zod của đề
  llm.ts, models.ts         gọi AI, danh sách model, tự đổi model
  greeting.ts               tạo câu chào đầu tiên
  pii.ts, crypto.ts, log.ts lọc thông tin cá nhân, mã hóa key, nhật ký
supabase/migrations/        001–007
tests/                      Vitest
```

## Cài đặt và chạy

Yêu cầu: Node.js 20 trở lên và một project Supabase.

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # chạy Vitest
npm run build
```

Tạo file `.env` (không commit) với các biến sau:

| Biến | Dùng cho |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | khóa anon của Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | khóa service role, chỉ dùng phía server |
| `APP_SECRET` | khóa gốc để mã hóa API key của giáo viên |
| `NEXT_PUBLIC_SITE_URL` | địa chỉ công khai của site |
| `GMAIL_SMTP_USER`, `GMAIL_SMTP_APP_PASSWORD` | gửi email xác nhận và đặt lại mật khẩu |
| `NEXT_PUBLIC_ADMIN_CONTACT` | liên hệ hiện trong thông báo lỗi |

## Cơ sở dữ liệu

Chạy các file trong `supabase/migrations/` theo thứ tự số (`001_init.sql` đến `007_drop_usage.sql`) trên project Supabase.

## Triển khai

Triển khai trên Vercel, khai báo các biến môi trường ở trên. Bản kế hoạch ban đầu nằm ở [PLAN.md](PLAN.md).

## Ẩn danh

Học sinh chỉ có một mã ngẫu nhiên trong cookie. Hệ thống không lưu IP, tên, lớp hay trình duyệt. Tin nhắn được lọc thông tin cá nhân (số điện thoại, email, tên) trước khi lưu. Giáo viên chỉ thấy "HS #n" của từng liên kết.
