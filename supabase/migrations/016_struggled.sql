-- Bước học sinh gặp khó: bit của từng bước (cùng cách đánh bit với progress/revealed). Bật khi học sinh bấm Gợi ý, bấm Em chưa hiểu, nộp/chọn sai hoặc được giải hộ ở bước đó. Dùng cho thống kê giáo viên.
alter table chat_sessions add column if not exists struggled int not null default 0;
-- Bỏ kiểu Chat khỏi cài đặt: chuyển giáo viên đang dùng Chat sang Từng bước, và đổi mặc định.
update teacher_settings set interaction_mode = 'steps' where interaction_mode = 'chat';
alter table teacher_settings alter column interaction_mode set default 'steps';
