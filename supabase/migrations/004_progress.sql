-- Tiến độ xác minh theo mốc lời giải: bit i = 1 khi mốc i đã được học sinh tự làm và server xác minh.
alter table chat_sessions add column if not exists progress int not null default 0;
