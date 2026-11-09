-- Kiểu "Trắc nghiệm từng bước": số lần chọn sai ở bước hiện tại, về 0 khi qua bước. Đủ MAX_WRONG (lib/modes.ts) thì hiện lời giải bước đó.
alter table chat_sessions add column if not exists wrong int not null default 0;
