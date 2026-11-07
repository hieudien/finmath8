-- Hạn mức lượt gọi AI mỗi ngày do giáo viên tự nhập (API của Gemini/OpenAI không cho đọc quota còn lại). 0 = chưa đặt.
alter table teacher_settings add column if not exists daily_limit int not null default 0;
