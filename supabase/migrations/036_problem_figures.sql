-- Hình vẽ của đề (hình học): ảnh đã cắt riêng khỏi ảnh đề, lưu ở bucket công khai "figures".
-- Đường dẫn lưu trong content.figure.path của đề: <teacher_id>/<mã ngẫu nhiên>.<png|jpg|webp>.
-- Chỉ server (service role) ghi/xóa; ai có đường dẫn đều xem được (học sinh vào liên kết không đăng nhập). Hình đề bài không phải dữ liệu riêng tư.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('figures', 'figures', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
