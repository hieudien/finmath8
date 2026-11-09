-- Kiểu học sinh tương tác với bài: chọn ở cài đặt giáo viên, ghim vào từng phiên lúc bắt đầu.
-- Không đặt check: danh sách kiểu nằm trong lib/modes.ts (thêm kiểu mới khỏi sửa DB).
alter table teacher_settings add column if not exists interaction_mode text not null default 'chat';
alter table chat_sessions add column if not exists mode text not null default 'chat';
