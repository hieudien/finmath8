# MathStep AI

Chatbot gợi mở giúp học sinh tự giải Toán từng bước, cho mọi lớp và mọi dạng đề (giải phương trình, hình học, tỉ lệ, bài toán thực tế, tình huống tài chính...).

Chatbot **không đưa đáp án**. Nó hỏi từng bước theo cách giải quyết vấn đề của Polya, tăng gợi ý theo mức khi học sinh kẹt, và chỉ kết thúc bài khi học sinh đã nêu kết quả cùng cách làm. Giáo viên tạo đề, gửi liên kết công khai và theo dõi điểm mạnh, điểm yếu của từng học sinh. Học sinh vào bằng liên kết, chỉ nhập họ tên và lớp, không cần tài khoản.

## Cách hoạt động

1. Giáo viên đăng ký, nhập API key của Google Gemini hoặc OpenAI trong Cài đặt (key được mã hóa AES-256-GCM, không trả về trình duyệt).
2. Giáo viên tạo đề: soạn trực tiếp, dán văn bản, nạp JSON hoặc chụp ảnh đề. AI điền đáp án, lời giải, gợi ý và câu chào đầu tiên; giáo viên kiểm tra rồi lưu. Giáo viên bấm "Tạo chỉ dẫn từng bước" để AI viết việc cần làm và gợi ý cho từng bước.
3. Giáo viên chọn một hoặc nhiều đề (đề cần có lời giải từng bước, thiếu thì học sinh chưa làm được), tạo liên kết công khai và gửi cho học sinh.
4. Học sinh mở liên kết, nhập họ tên và lớp (không nhớ, mở lại là nhập lại), chọn đề, làm bài theo kiểu đã chọn, tự đánh giá mức hiểu bài và mức hài lòng cuối bài.
5. Hệ thống chấm theo 4 tiêu chí (nhận diện, lập kế hoạch, tính toán, giải thích). Giáo viên xem thống kê theo liên kết, hồ sơ từng học sinh và nội dung hội thoại.

## Tính năng

**Giáo viên**
- Trình tạo và sửa đề: tiêu đề, lớp, chủ đề, kỹ năng, đề bài, đáp án (JSON), lời giải từng bước, 3 mức gợi ý, sai lầm thường gặp, câu chào.
- Đọc đề từ ảnh (chụp hoặc dán Ctrl+V) bằng AI; nạp JSON (kiểm tra bằng Zod, báo lỗi theo trường) hoặc dán văn bản để AI chuẩn hóa. Đề mẫu có sẵn trong `de-mau-10.json`.
- Soạn công thức bằng bàn phím toán MathLive, xem trước KaTeX ngay trong ô nhập.
- Đề do AI tạo có cờ `reviewed = false`: phải mở đề, tick xác nhận đáp án đúng rồi lưu mới được đưa vào liên kết.
- AI tạo lời giải từng bước và kiểm tra lời giải khớp đáp án.
- Cách làm bài duy nhất là **Từng bước**: học sinh nộp một bước mỗi lần. Đề thiếu lời giải từng bước thì API trả lỗi "Bài này chưa sẵn sàng". Phiên cũ kiểu Chat hoặc Trắc nghiệm vẫn xem được trong lịch sử.
- Chỉ dẫn từng bước do AI viết sẵn: việc cần làm, 3 mức gợi ý riêng từng bước (nút "Tạo chỉ dẫn từng bước" ở danh sách đề và trang từng đề).
- Liên kết công khai: bật/tắt, hạn dùng, giới hạn số tin, nhãn nhóm (trước, sau, thực nghiệm, đối chứng).
- Trang **Học sinh**: gom theo tên và lớp; điểm trung bình 4 tiêu chí, kỹ năng cần củng cố, lỗi hay mắc, kiến thức nền còn thiếu (khi được giải hộ), danh sách bài đã làm (kể cả bài bỏ dở) và nút **AI phân tích và đề xuất cải thiện**. Mở từng phiên (ở Thống kê hoặc hồ sơ học sinh) có nút **AI phân tích phiên này**: nhận xét điểm tốt, điểm yếu và việc nên làm, lưu lại để xem lại.
- Thống kê theo liên kết: số phiên, tỉ lệ hoàn thành, điểm, mức gợi ý, thời gian, so sánh giữa các nhóm, xem hội thoại từng phiên. Xuất CSV (có mã và tên học sinh).
- Bước học sinh hay gặp khó (bấm Gợi ý, hỏi, làm sai, được giải hộ; cột `chat_sessions.struggled`): hiện ở Thống kê (cả lớp), hồ sơ học sinh, dòng "Hay vướng" ở danh sách Học sinh; AI đề xuất cải thiện có thêm "Ôn tập theo bước".
- Xóa mềm: xóa liên kết (`public_links.deleted_at`) và xóa học sinh (bảng `students`, `deleted_at`) chỉ ẩn khỏi giao diện; phiên, tin nhắn, điểm giữ nguyên. Học sinh vào lại bằng cùng tên và lớp thì hiện lại. Trigger ở DB chặn xóa cứng.
- Nhật ký hoạt động chỉ thêm, không sửa; nằm trong Cài đặt, chỉ tải khi mở mục. Cài đặt còn có Nhật ký lỗi riêng và thống kê Chi phí AI (token theo nhà cung cấp, model, mục đích). Có hướng dẫn sử dụng cho giáo viên.

**Học sinh**
- Không cần tài khoản. Nhập họ tên và lớp (tối đa 10 ký tự); thông tin không lưu trong trình duyệt, mở liên kết hay tải lại là nhập lại; có nút Đổi thông tin. Server sinh khóa nội bộ `student_code` từ tên bỏ dấu + lớp (vd `NGUYENVANA.8A1`): cùng tên cùng lớp là một học sinh.
- Câu chào hiện ngay khi mở bài; đề bài ghim phía trên; bot hỏi một câu cụ thể mỗi lượt.
- Nút **Công thức** để gõ phân số, căn, số mũ; công thức hiển thị bằng KaTeX.
- Gợi ý: 3 mức riêng cho từng bước, lấy từ đề, không gọi AI.
- Ô nhập ngắn, nút **Em chưa hiểu** để hỏi (có giới hạn lượt).
- Hết gợi ý mà vẫn kẹt (5 lượt kẹt) thì bot hiện lời giải bước đó; bước được giải hộ không được tính điểm.

**Chat engine** ([lib/chat](lib/chat))
- `steps.ts`: lượt làm bài từng bước (server tự xác minh bước có số, AI nhỏ chỉ viết nhận xét cho một bước). `engine.ts`: phần dùng chung (ghi tin của bot, chấm điểm cuối phiên). `prompt.ts`: kiểm tra lộ đáp án và prompt chấm điểm. `canned.ts`: câu cố định của bot (nhiều biến thể, không gọi AI) cho trường hợp học sinh nói không biết, nộp lại tin cũ, lạc đề, hết lượt hỏi. `assist.ts`: thang gợi ý, hiện lời giải khi kẹt, trần điểm theo phần tự làm.
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
  dashboard/                tổng quan, đề (tạo, sửa), liên kết, thống kê, học sinh, cài đặt (có nhật ký), hướng dẫn
  c/[slug]/                 trang chat của học sinh
  api/                      auth, chat, chat-log, export, links, logs, problems, settings, students
components/                 giao diện (Chat, ProblemEditor, MathTextArea, FormulaDialog, ...)
lib/
  chat/                     engine, steps, assist, canned, goals, prompt, tiến độ
  schema/problem.ts         schema Zod của đề
  students.ts               hồ sơ học sinh
  llm.ts, models.ts         gọi AI (kể cả ảnh), danh sách model, tự đổi model
  step-guides.ts            AI viết chỉ dẫn và gợi ý từng bước
  batch.ts                  chạy hàng loạt theo lượt: tách đề thô, mã đề mới, song song có hạn giờ
  pii.ts, crypto.ts, log.ts lọc thông tin cá nhân, mã hóa key, nhật ký
public/mathlive-fonts/      font của MathLive
supabase/migrations/        001–020
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

Chạy các file trong `supabase/migrations/` theo thứ tự số (`001_init.sql` đến `023_student_class.sql`) trên project Supabase. File `011` thêm mã và tên học sinh vào `chat_sessions`, view `student_stats` và bảng `student_advice`. `012` thêm kiểu làm bài (`interaction_mode`, `mode`; giờ chỉ giữ cho dữ liệu cũ). `013` thêm `stall`, `revealed` và `gaps` (kiến thức nền còn thiếu). `014` thêm `wrong` (của kiểu Trắc nghiệm đã bỏ, chỉ giữ cho dữ liệu cũ). `015` thêm bảng `session_analysis` (nhận xét AI cho từng phiên). `016` thêm `struggled` (bước gặp khó), chuyển giáo viên đang dùng Chat sang Từng bước và đổi mặc định. `017` thêm `public_links.deleted_at` (xóa mềm), trigger chặn xóa cứng, gỡ job pg_cron xóa nhật ký quá 30 ngày. `018` thêm bảng `students` (xóa mềm) và viết lại view `student_stats`. `019` thêm hàm `ai_usage_summary` (tổng token AI cho Cài đặt). `020` thêm bảng nhật ký lỗi riêng, siêu dữ liệu từng tin của bot, lịch sử bản đề và dọn phiên bỏ dở. `021` thêm hàm `rename_problem` (đổi mã đề, cập nhật cả liên kết và phiên cũ trong một giao dịch). `022` thêm `chat_sessions.problem_snapshot` (mỗi phiên giữ bản đề lúc mở). `023` thêm `chat_sessions.student_class` và `students.class` (lớp của học sinh), view `student_stats` có thêm cột `student_class`.

## Triển khai

Triển khai trên Vercel, khai báo các biến môi trường ở trên. Bản kế hoạch ban đầu nằm ở [PLAN.md](PLAN.md).

## Quyền riêng tư và dữ liệu

- **Lưu:** họ tên và lớp học sinh tự nhập, nội dung hội thoại, điểm chấm. Giáo viên chỉ thấy học sinh thuộc liên kết của mình (RLS).
- **Không xóa cứng:** xóa liên kết hoặc học sinh chỉ đặt `deleted_at`; trigger DB chặn `DELETE` và `TRUNCATE` trên các bảng dữ liệu (xóa tài khoản giáo viên cần gỡ trigger trước). Nhật ký không còn bị xóa sau 30 ngày.
- **Không lưu:** trường, IP, thông tin trình duyệt.
- **Tự che:** số điện thoại và email trong tin nhắn, trước khi lưu và trước khi gửi AI. Tên và lớp học sinh không được gửi cho AI khi chat.
- **API key** của giáo viên được mã hóa AES-256-GCM, không trả về trình duyệt.
- Dữ liệu chỉ dùng cho nghiên cứu sư phạm.
