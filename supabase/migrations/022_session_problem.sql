-- Mỗi phiên giữ bản đề lúc mở: giáo viên sửa đề thì chỉ phiên mở sau thấy đổi. Null = phiên cũ, dùng bản chụp của liên kết.
alter table chat_sessions add column if not exists problem_snapshot jsonb;
