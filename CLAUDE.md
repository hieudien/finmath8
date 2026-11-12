# Quy tắc làm việc với agent

- **Khi người dùng hỏi:** chỉ trả lời câu hỏi. Không sửa file, không chạy lệnh làm thay đổi gì.
- **Khi người dùng nói "plan":** chỉ lập kế hoạch. Không sửa file, không thực thi.
- **Chỉ bắt đầu làm khi người dùng nói "ok".** Chưa có "ok" thì không động tay vào code, DB hay cấu hình.
- **Khi cần chạy SQL (migration trong `supabase/migrations/`):** agent tự chạy lên DB Supabase, không nhờ người dùng chạy tay. Kết nối Postgres trực tiếp bằng `supabase_url` (lấy project ref) và `supabase_password` trong `.env`, chạy file theo thứ tự số, không in mật khẩu ra. Chỉ chạy file migration của repo này; không `drop`/`truncate` bảng dữ liệu nếu người dùng chưa nói rõ.
- **Dùng `.env`:** được phép đọc/dùng `.env` (kết nối DB, API key...) bất cứ khi nào cần để thực hiện yêu cầu của người dùng, kể cả đọc dữ liệu (ví dụ phân tích phiên chat). Không in giá trị bí mật (mật khẩu, key) ra màn hình hay commit chúng.
