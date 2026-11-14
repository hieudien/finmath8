# MathStep AI

Chatbot gợi mở giúp học sinh tự giải Toán, cho mọi lớp và mọi dạng đề (giải phương trình, hình học, tỉ lệ, bài toán thực tế, tình huống tài chính...).

Chatbot **không đưa đáp án**. Nó nhận xét bài làm của học sinh (một bước, nhiều bước hoặc cả bài) theo cách giải quyết vấn đề của Polya, tăng gợi ý theo mức khi học sinh kẹt, và chỉ kết thúc bài khi học sinh đã nêu kết quả cùng cách làm. Giáo viên tạo đề, gửi liên kết công khai và theo dõi điểm mạnh, điểm yếu của từng học sinh. Học sinh vào bằng liên kết, chỉ nhập họ tên và lớp, không cần tài khoản.

## Cách hoạt động

1. Giáo viên đăng ký, nhập API key của Google Gemini trong Cài đặt (key được mã hóa AES-256-GCM, không trả về trình duyệt).
2. Giáo viên tạo đề: soạn trực tiếp, chụp ảnh đề hoặc tạo hàng loạt từ tệp Word (tab "Tạo đề hàng loạt"). AI điền đáp án, lời giải, gợi ý và câu chào đầu tiên; giáo viên kiểm tra rồi lưu. Giáo viên bấm "Chuẩn hóa đề" để AI viết lời giải chi tiết từng bước cơ bản nhất (mỗi bước một phép biến đổi hoặc tính toán nhỏ). Học sinh không thấy các bước này.
3. Giáo viên chọn một hoặc nhiều đề (đề cần có lời giải chi tiết, thiếu thì học sinh chưa làm được), tạo liên kết công khai và gửi cho học sinh.
4. Học sinh mở liên kết, nhập họ tên và lớp (không nhớ, mở lại là nhập lại), chọn đề, viết bài làm vào một ô (một bước, nhiều bước hoặc cả bài), xin gợi ý hoặc hỏi bài khi cần.
5. Hệ thống chấm theo 4 tiêu chí (hiểu đề bài, lập kế hoạch giải, thực hiện kế hoạch, kiểm tra và đánh giá), điểm mỗi tiêu chí hiển thị thang 10. Giáo viên xem thống kê theo liên kết, theo đề, hồ sơ từng học sinh và nội dung hội thoại, có thể gửi phụ huynh một liên kết xem kết quả.

## Tính năng

**Giáo viên**
- Trình tạo và sửa đề: tiêu đề, lớp, chủ đề, kỹ năng, đề bài, đáp án (JSON), lời giải chi tiết, 3 mức gợi ý chung của đề, sai lầm thường gặp, câu chào.
- Phân loại đề: nhánh (đại số, hình học, khác), lớp và chủ đề theo chương trình GDPT 2018 lớp 6-9 (`lib/taxonomy.ts`); danh sách đề lọc theo các mục này.
- Hình vẽ cho đề hình học: đọc ảnh đề thì AI khoanh khung hình (giáo viên chỉnh lại được), ảnh cắt lưu ở bucket công khai `figures`, trong đề chỉ giữ đường dẫn và mô tả bằng chữ (`lib/figure.ts`). Chat, giải và chấm chỉ đọc phần mô tả.
- Đọc đề từ ảnh (chụp hoặc dán Ctrl+V) bằng AI; tạo hàng loạt từ tệp Word (bản nháp, xác nhận mới lưu, có lịch sử các đợt). Đề mẫu có sẵn trong `de-mau-10.json`.
- Soạn công thức bằng bàn phím toán MathLive, xem trước KaTeX ngay trong ô nhập.
- Đề do AI tạo có cờ `reviewed = false`: phải mở đề, tick xác nhận đáp án đúng rồi lưu mới được đưa vào liên kết.
- AI tạo lời giải chi tiết từng bước cơ bản và kiểm tra lời giải khớp đáp án.
- Cách làm bài duy nhất là chat nhận xét bài làm: học sinh viết một bước, nhiều bước hoặc cả bài mỗi lần nộp; giao diện không có yêu cầu hay gợi ý theo bước. Đề thiếu lời giải chi tiết thì API trả lỗi "Bài này chưa sẵn sàng". Phiên cũ của các kiểu đã bỏ (từng bước, trắc nghiệm, worksheet) vẫn xem được trong lịch sử.
- Chuẩn hóa đề chỉ tạo lại dữ kiện, đáp án (có bỏ phiếu), kỹ năng, sai lầm thường gặp, 3 mức gợi ý và lời giải chi tiết (`solution_steps`); không còn kết quả chuẩn từng bước, sai lầm gắn bước, mục tiêu, câu mở rộng. Nhận xét và gợi ý do AI viết lúc chạy, chỉ dựa trên đề đã chuẩn hóa. Nút "Chuẩn hóa đề" ở trang từng đề, "Chuẩn hóa N đề" ở danh sách đề.
- Liên kết công khai: bật/tắt, hạn dùng, nhãn nhóm (trước, sau, thực nghiệm, đối chứng).
- Trang **Học sinh**: gom theo tên và lớp; điểm trung bình 4 tiêu chí (thang 10), kỹ năng cần củng cố, lỗi hay mắc, danh sách bài đã làm (kể cả bài bỏ dở) và nút **AI phân tích và đề xuất cải thiện**. Mở từng phiên (ở Thống kê hoặc hồ sơ học sinh) có nút **AI phân tích phiên này**: nhận xét điểm tốt, điểm yếu và việc nên làm, lưu lại để xem lại.
- Thống kê theo liên kết: số phiên, tỉ lệ hoàn thành, điểm, mức gợi ý, thời gian, so sánh giữa các nhóm, xem hội thoại từng phiên. Có thêm thống kê theo đề (mỗi đề có những học sinh nào, em nào làm được) và theo học sinh.
- Bước học sinh hay gặp khó (bấm Gợi ý, hỏi, làm sai; cột `chat_sessions.struggled`): hiện ở Thống kê (cả lớp), hồ sơ học sinh, dòng "Hay vướng" ở danh sách Học sinh; AI đề xuất cải thiện có thêm "Ôn tập theo bước".
- Liên kết cho phụ huynh: nút chia sẻ ở hồ sơ học sinh tạo liên kết công khai `/p/[token]` (chỉ đọc: điểm, nhận xét AI, danh sách bài, hội thoại); thu hồi được bất cứ lúc nào (bảng `student_shares`, `lib/share.ts`).
- Xóa mềm: xóa liên kết (`public_links.deleted_at`) và xóa học sinh (bảng `students`, `deleted_at`) chỉ ẩn khỏi giao diện; phiên, tin nhắn, điểm giữ nguyên. Học sinh vào lại bằng cùng tên và lớp thì hiện lại. Trigger ở DB chặn xóa cứng.
- Nhật ký hoạt động chỉ thêm, không sửa; nằm trong Cài đặt, chỉ tải khi mở mục. Cài đặt còn có Nhật ký lỗi riêng, **Xác nhận đáp án hàng loạt** (so đáp án AI với đáp án tự giải rồi khóa), **Kiểm tra đề** (AI giải lại và rà phép tính, đề có vấn đề gắn cảnh báo) và **Chuẩn hóa tất cả đề**. Tick xác nhận đáp án khi sửa đề cũng khóa đáp án. Có hướng dẫn sử dụng cho giáo viên.

**Học sinh**
- Không cần tài khoản. Nhập họ tên và lớp (tối đa 10 ký tự); thông tin không lưu trong trình duyệt, mở liên kết hay tải lại là nhập lại; có nút Đổi thông tin. Server sinh khóa nội bộ `student_code` từ tên bỏ dấu + lớp (vd `NGUYENVANA.8A1`): cùng tên cùng lớp là một học sinh.
- Câu chào hiện ngay khi mở bài; đề bài (kèm hình vẽ nếu có) ghim phía trên; bot trả lời dần dần và nhận xét đúng phần vừa nộp.
- Mở lại bài làm dở thì hỏi **Làm tiếp** hay **Làm lại mới**.
- Nút **Công thức** để gõ phân số, căn, số mũ; công thức hiển thị bằng KaTeX.
- Gợi ý: 3 mức tăng dần (nêu hướng, nêu cách làm bằng lời, câu hỏi nhỏ), AI viết lúc bấm, bám bài làm đã nộp; không qua rào chống lộ đáp án thì dùng gợi ý chung của đề. Hết 3 mức thì bot trả câu cố định, không gọi AI.
- Một ô bài làm chung, nút **Em chưa hiểu** để hỏi.

**Chat engine** ([lib/chat](lib/chat))
- `free.ts`: chat nộp bài làm kiểu "hỏi gia sư". Mỗi lượt chỉ một lần gọi AI, trả lời dần dần, nhận xét đúng phần học sinh vừa nộp. Cũng chứa nút Gợi ý (`freeHint`, 3 mức). Việc không cần AI do server làm: nhận ra cầu cứu và lạc đề, kiểm phép tính sai, chặn lộ đáp án theo từng câu, quyết định xong bài (đã nêu đúng đáp án cuối, có phép biến đổi, không có phép sai, AI không báo lỗi toán). Việc nặng như chấm điểm và thống kê chạy ngầm ở route.
- `engine.ts`: phần dùng chung (ghi tin của bot, chấm điểm cuối phiên). `prompt.ts`: kiểm tra lộ đáp án và prompt chấm điểm. `arith.ts`: server tự bắt phép tính và so sánh số học sai, không gọi model. `progress.ts`: chuẩn hóa số, so khớp. `canned.ts`: câu cố định của bot (nhiều biến thể, không gọi AI) cho trường hợp học sinh nói không biết, nộp lại tin cũ, lạc đề, hết gợi ý. `intent.ts`: đoán tin là câu hỏi hay bài làm (client và server dùng chung). `goals.ts`: câu chào.
- Giao diện nhập có hai ô riêng: **Bài làm** (viền xanh) và khay **Hỏi bài** (viền vàng, mở bằng nút Em chưa hiểu); gõ nhầm sẽ có gợi ý chuyển ô.
- Công thức LaTeX trong tin nhắn được chuẩn hóa (ví dụ `rac{1}{2}` thành 0.5) trước khi so với đáp án.
- Chặn lộ đáp án: câu của bot sắp lộ kết quả bị cắt và thay bằng câu cố định; chặn đổi vai và lấy prompt.
- Lọc thông tin cá nhân trước khi lưu và trước khi gửi AI.
- Tự đổi sang model khác của cùng nhà cung cấp khi hết lượt hoặc quá tải; giới hạn tốc độ (chống gửi dồn), không giới hạn số phiên hay số lượt.

## Công nghệ

- Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4
- Supabase: Postgres, Auth, RLS
- Google Gemini (`@google/genai`), dùng key của giáo viên
- Zod, KaTeX, MathLive, Recharts, simple-statistics, Nodemailer (Gmail SMTP)
- Vitest

## Cấu trúc thư mục

```
app/
  page.tsx                  trang giới thiệu
  (auth)/                   đăng ký, đăng nhập, quên và đặt lại mật khẩu
  dashboard/                tổng quan, đề (tạo, sửa), liên kết, thống kê, học sinh, cài đặt (có nhật ký), hướng dẫn
  c/[slug]/                 trang chat của học sinh
  p/[token]/                trang kết quả công khai cho phụ huynh (chỉ đọc)
  api/                      auth, chat, chat-log, client-error, errors, links, logs, p, problems, settings, students
components/                 giao diện (Chat, ProblemEditor, MathTextArea, FormulaDialog, ...)
lib/
  chat/                     free, engine, arith, canned, goals, intent, progress, prompt
  schema/problem.ts         schema Zod của đề
  students.ts               hồ sơ học sinh
  share.ts                  tra liên kết phụ huynh
  figure.ts                 hình vẽ của đề (bucket figures, mô tả cho AI)
  taxonomy.ts               phân loại đề (đại số, hình học, chủ đề theo lớp)
  llm.ts, models.ts         gọi AI (kể cả ảnh), danh sách model, tự đổi model
  import-batch.ts           đợt nạp đề hàng loạt từ tệp Word (bản nháp, xác nhận, lịch sử)
  batch.ts                  chạy hàng loạt theo lượt: tách đề thô, mã đề mới, song song có hạn giờ
  pii.ts, crypto.ts, log.ts lọc thông tin cá nhân, mã hóa key, nhật ký
public/mathlive-fonts/      font của MathLive
supabase/migrations/        001–039
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

Chạy các file trong `supabase/migrations/` theo thứ tự số (`001_init.sql` đến `039_drop_ai_usage_summary.sql`) trên project Supabase. File `011` thêm mã và tên học sinh vào `chat_sessions`, view `student_stats` và bảng `student_advice`. `012` thêm kiểu làm bài (`interaction_mode`, `mode`; chỉ `chat_sessions.mode` còn giữ cho phiên cũ). `013` thêm `stall`, `revealed` và `gaps` (kiến thức nền còn thiếu). `014` thêm `wrong` (của kiểu Trắc nghiệm đã bỏ, chỉ giữ cho dữ liệu cũ). `015` thêm bảng `session_analysis` (nhận xét AI cho từng phiên). `016` thêm `struggled` (bước gặp khó), chuyển giáo viên đang dùng Chat sang Từng bước và đổi mặc định. `017` thêm `public_links.deleted_at` (xóa mềm), trigger chặn xóa cứng, gỡ job pg_cron xóa nhật ký quá 30 ngày. `018` thêm bảng `students` (xóa mềm) và viết lại view `student_stats`. `019` thêm hàm `ai_usage_summary` (đã gỡ ở `039`). `020` thêm bảng nhật ký lỗi riêng, siêu dữ liệu từng tin của bot, lịch sử bản đề và dọn phiên bỏ dở. `021` thêm hàm `rename_problem` (đổi mã đề, cập nhật cả liên kết và phiên cũ trong một giao dịch). `022` thêm `chat_sessions.problem_snapshot` (mỗi phiên giữ bản đề lúc mở). `023` thêm `chat_sessions.student_class` và `students.class` (lớp của học sinh), view `student_stats` có thêm cột `student_class`. `024` thêm bảng `import_batches` (mỗi đợt nạp đề Word là một dòng: bản nháp, xác nhận, lịch sử). `025` bỏ OpenAI: giáo viên đang chọn OpenAI chuyển về Gemini, xóa cột `openai_key_enc`, ràng buộc `provider` chỉ còn `gemini`. `026` thêm `restarted` (học sinh chọn Làm lại mới thì phiên cũ không còn được gợi ý làm tiếp). `027`, `029` thuộc chế độ worksheet đã bỏ (nháp đáp án và định dạng phản hồi). `028` thêm bảng `student_shares` (liên kết cho phụ huynh, thu hồi được). `030`, `033` thêm rồi cố định kiểu làm bài của liên kết; `035` bỏ hẳn chế độ worksheet và gỡ cột `public_links.mode`, `teacher_settings.interaction_mode`. `031` đổi tên 4 tiêu chí trong thống kê. `032` thống kê theo đề. `034` thống kê token AI theo đề và theo phiên. `036` tạo bucket công khai `figures` cho hình vẽ của đề. `037` dọn cột của các chế độ cũ (giữ `revealed`, `struggled`, `step`, `hint_level` cho phiên cũ). `038` bỏ các trường đề không còn dùng khỏi `problems.content`. `039` gỡ hàm `ai_usage_summary`.

## Triển khai

Triển khai trên Vercel, khai báo các biến môi trường ở trên.

## Quyền riêng tư và dữ liệu

- **Lưu:** họ tên và lớp học sinh tự nhập, nội dung hội thoại, điểm chấm. Giáo viên chỉ thấy học sinh thuộc liên kết của mình (RLS).
- **Không xóa cứng:** xóa liên kết hoặc học sinh chỉ đặt `deleted_at`; trigger DB chặn `DELETE` và `TRUNCATE` trên các bảng dữ liệu (xóa tài khoản giáo viên cần gỡ trigger trước). Nhật ký không còn bị xóa sau 30 ngày.
- **Không lưu:** trường, IP, thông tin trình duyệt.
- **Tự che:** số điện thoại và email trong tin nhắn, trước khi lưu và trước khi gửi AI. Tên và lớp học sinh không được gửi cho AI khi chat.
- **Công khai:** ảnh hình vẽ của đề (bucket `figures`, ai có đường dẫn đều xem được) và trang kết quả phụ huynh `/p/[token]` (ai có liên kết đều xem được, giáo viên thu hồi khi cần).
- **API key** của giáo viên được mã hóa AES-256-GCM, không trả về trình duyệt.
- Dữ liệu chỉ dùng cho nghiên cứu sư phạm.
