# MathStep AI

Chatbot gợi mở giúp học sinh tự giải Toán từng bước, cho mọi lớp và mọi dạng đề (giải phương trình, hình học, tỉ lệ, bài toán thực tế, tình huống tài chính...).

Chatbot **không đưa đáp án**. Nó hỏi từng bước theo cách giải quyết vấn đề của Polya, tăng gợi ý theo mức khi học sinh kẹt, và chỉ kết thúc bài khi học sinh đã nêu kết quả cùng cách làm. Giáo viên tạo đề, gửi liên kết công khai và theo dõi điểm mạnh, điểm yếu của từng học sinh. Học sinh vào bằng liên kết, chỉ nhập mã và họ tên, không cần tài khoản.

## Cách hoạt động

1. Giáo viên đăng ký, nhập API key của Google Gemini hoặc OpenAI trong Cài đặt (key được mã hóa AES-256-GCM, không trả về trình duyệt).
2. Giáo viên tạo đề: soạn trực tiếp, dán văn bản, nạp JSON hoặc chụp ảnh đề. AI điền đáp án, lời giải, gợi ý và câu chào đầu tiên; giáo viên kiểm tra rồi lưu. Với kiểu Từng bước và Trắc nghiệm, giáo viên bấm "Tạo chỉ dẫn từng bước" để AI viết việc cần làm, gợi ý và câu trắc nghiệm cho từng bước.
3. Giáo viên chọn kiểu làm bài ở Cài đặt (Chat, Từng bước, Trắc nghiệm từng bước), chọn một hoặc nhiều đề, tạo liên kết công khai và gửi cho học sinh.
4. Học sinh mở liên kết, nhập mã và họ tên (nhớ trong trình duyệt), chọn đề, làm bài theo kiểu đã chọn, tự đánh giá mức hiểu bài và mức hài lòng cuối bài.
5. Hệ thống chấm theo 4 tiêu chí (nhận diện, lập kế hoạch, tính toán, giải thích). Giáo viên xem thống kê theo liên kết, hồ sơ từng học sinh và nội dung hội thoại.

## Tính năng

**Giáo viên**
- Trình tạo và sửa đề: tiêu đề, lớp, chủ đề, kỹ năng, đề bài, đáp án (JSON), lời giải từng bước, 3 mức gợi ý, sai lầm thường gặp, câu chào.
- Đọc đề từ ảnh (chụp hoặc dán Ctrl+V) bằng AI; nạp JSON (kiểm tra bằng Zod, báo lỗi theo trường) hoặc dán văn bản để AI chuẩn hóa. Đề mẫu có sẵn trong `de-mau-10.json`.
- Soạn công thức bằng bàn phím toán MathLive, xem trước KaTeX ngay trong ô nhập.
- Đề do AI tạo có cờ `reviewed = false`: phải mở đề, tick xác nhận đáp án đúng rồi lưu mới được đưa vào liên kết.
- AI tạo lời giải từng bước và kiểm tra lời giải khớp đáp án.
- 3 kiểu làm bài, chọn ở Cài đặt (ghim vào từng phiên lúc bắt đầu): **Chat** (nhắn tự do), **Từng bước** (nộp một bước mỗi lần), **Trắc nghiệm từng bước** (4 đáp án mỗi bước, 1 đúng và 3 bẫy lỗi hay gặp kèm lời giải thích). Đề thiếu chỉ dẫn hoặc trắc nghiệm tự lùi kiểu: Trắc nghiệm, rồi Từng bước, rồi Chat.
- Chỉ dẫn từng bước do AI viết sẵn: việc cần làm, 3 mức gợi ý riêng từng bước, trắc nghiệm (nút "Tạo chỉ dẫn từng bước" ở danh sách đề và trang từng đề).
- Kiểm thử chatbot cho từng đề: không lộ đáp án, che thông tin cá nhân, kéo học sinh về bài, không xác nhận đáp án sai, tăng gợi ý dần, hỏi cách làm khi chỉ có đáp số.
- Liên kết công khai: bật/tắt, hạn dùng, giới hạn số tin, nhãn nhóm (trước, sau, thực nghiệm, đối chứng).
- Trang **Học sinh**: gom theo mã học sinh; điểm trung bình 4 tiêu chí, kỹ năng cần củng cố, lỗi hay mắc, kiến thức nền còn thiếu (khi được giải hộ), danh sách bài đã làm (kể cả bài bỏ dở) và nút **AI phân tích và đề xuất cải thiện**.
- Thống kê theo liên kết: số phiên, tỉ lệ hoàn thành, điểm, mức gợi ý, thời gian, so sánh giữa các nhóm, xem hội thoại từng phiên. Xuất CSV (có mã và tên học sinh).
- Nhật ký hoạt động chỉ thêm, không sửa; hướng dẫn sử dụng cho giáo viên.

**Học sinh**
- Không cần tài khoản. Nhập mã học sinh (chữ, số, `._-`, tối đa 20 ký tự) và họ tên một lần; có nút Đổi thông tin.
- Câu chào hiện ngay khi mở bài; đề bài ghim phía trên; bot hỏi một câu cụ thể mỗi lượt.
- Nút **Công thức** để gõ phân số, căn, số mũ; công thức hiển thị bằng KaTeX.
- Gợi ý: kiểu Chat có 4 mức (định hướng, chỉ cách giải, nêu bước kế tiếp, làm mẫu bằng số khác); kiểu Từng bước và Trắc nghiệm có 3 mức riêng cho từng bước, lấy từ đề, không gọi AI.
- Kiểu Từng bước: ô nhập ngắn, nút **Em chưa hiểu** để hỏi (có giới hạn lượt). Kiểu Trắc nghiệm: chọn đáp án rồi bấm Trả lời, đáp án sai bị mờ đi.
- Hết gợi ý mà vẫn kẹt (5 lượt kẹt ở Từng bước, 3 lần chọn sai ở Trắc nghiệm) thì bot hiện lời giải bước đó; bước được giải hộ không được tính điểm.

**Chat engine** ([lib/chat](lib/chat))
- `engine.ts`/`prompt.ts`: kiểu Chat. `steps.ts`: kiểu Từng bước (server tự xác minh bước có số, AI nhỏ chỉ viết nhận xét cho một bước). `quiz.ts`: kiểu Trắc nghiệm (server tự chấm bằng so khớp chuỗi, không gọi AI). `assist.ts`: thang gợi ý, hiện lời giải khi kẹt, trần điểm theo phần tự làm. Kiểu và lùi kiểu nằm ở [lib/modes.ts](lib/modes.ts).
- Tiến độ theo mốc lời giải; server tự xác minh mốc có số, mốc còn lại cần trích dẫn nguyên văn từ tin của học sinh.
- Công thức LaTeX trong tin nhắn được chuẩn hóa (ví dụ `\frac{1}{2}` thành 0.5) trước khi so với đáp án.
- Chỉ kết thúc khi đủ mốc và học sinh đã trình bày cách làm. Lời chúc mừng hoặc lời kết sớm của AI bị thay bằng câu hỏi tiếp.
- Chặn lộ đáp án và chặn bot tự giải hộ bước học sinh phải làm; chặn đổi vai và lấy prompt.
- Lọc thông tin cá nhân trước khi lưu và trước khi gửi AI.
- Tự đổi sang model khác của cùng nhà cung cấp khi hết lượt hoặc quá tải; giới hạn tốc độ và số phiên mỗi ngày.

## Công nghệ

- Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4
- Supabase: Postgres, Auth, RLS
- Google Gemini (`@google/genai`) hoặc OpenAI, dùng key của giáo viên
- Zod, KaTeX, MathLive, Recharts, simple-statistics, Nodemailer (Gmail SMTP)
- Vitest

## Cấu trúc thư mục

```
app/
  page.tsx                  trang giới thiệu
  (auth)/                   đăng ký, đăng nhập, quên và đặt lại mật khẩu
  dashboard/                tổng quan, đề (tạo, sửa), liên kết, thống kê, học sinh, nhật ký, cài đặt, hướng dẫn
  c/[slug]/                 trang chat của học sinh
  api/                      auth, chat, chat-log, export, links, problems, settings, students
components/                 giao diện (Chat, ProblemEditor, MathTextArea, FormulaDialog, ...)
lib/
  chat/                     engine, steps, quiz, assist, goals, prompt, tiến độ, kiểm thử chatbot
  schema/problem.ts         schema Zod của đề
  students.ts               hồ sơ học sinh
  llm.ts, models.ts         gọi AI (kể cả ảnh), danh sách model, tự đổi model
  modes.ts                  các kiểu làm bài và chuỗi lùi kiểu
  step-guides.ts            AI viết chỉ dẫn, gợi ý, trắc nghiệm từng bước
  greeting.ts               tạo câu chào đầu tiên
  pii.ts, crypto.ts, log.ts lọc thông tin cá nhân, mã hóa key, nhật ký
public/mathlive-fonts/      font của MathLive
supabase/migrations/        001–014
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

Chạy các file trong `supabase/migrations/` theo thứ tự số (`001_init.sql` đến `014_quiz.sql`) trên project Supabase. File `011` thêm mã và tên học sinh vào `chat_sessions`, view `student_stats` và bảng `student_advice`. `012` thêm kiểu làm bài (`interaction_mode`, `mode`). `013` thêm `stall`, `revealed` và `gaps` (kiến thức nền còn thiếu). `014` thêm `wrong` cho kiểu Trắc nghiệm.

## Triển khai

Triển khai trên Vercel, khai báo các biến môi trường ở trên. Bản kế hoạch ban đầu nằm ở [PLAN.md](PLAN.md).

## Quyền riêng tư và dữ liệu

- **Lưu:** mã và họ tên học sinh tự nhập, nội dung hội thoại, điểm chấm. Giáo viên chỉ thấy học sinh thuộc liên kết của mình (RLS).
- **Không lưu:** lớp, trường, IP, thông tin trình duyệt.
- **Tự che:** số điện thoại và email trong tin nhắn, trước khi lưu và trước khi gửi AI. Tên và mã học sinh không được gửi cho AI khi chat.
- **API key** của giáo viên được mã hóa AES-256-GCM, không trả về trình duyệt.
- Dữ liệu chỉ dùng cho nghiên cứu sư phạm.
