-- Xóa hẳn chế độ worksheet: bỏ cột chọn chế độ ở liên kết và ở cài đặt giáo viên. chat_sessions.mode giữ lại cho phiên cũ. Chạy lại an toàn.
alter table public_links drop column if exists mode;
alter table teacher_settings drop column if exists interaction_mode;
