-- Chế độ "làm theo bước rồi nộp cả bài": bản nháp đáp án các bước học sinh đang gõ nhưng chưa nộp, lưu khi rời ô nhập.
-- Dạng {"answers": ["...", ...]} (đúng số bước); null = chưa có nháp. Ghi đè mỗi lần lưu, không sinh dòng mới.
alter table chat_sessions add column if not exists draft jsonb;
