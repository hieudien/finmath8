-- Hết gợi ý mà học sinh vẫn kẹt: bot hiện lời giải bước đó và ghi nhận để chấm đúng.
-- stall = số lượt kẹt liên tiếp sau khi hết mức gợi ý. revealed = bit các mốc được hiện lời giải (cùng cách đánh bit với progress).
alter table chat_sessions add column if not exists stall int not null default 0;
alter table chat_sessions add column if not exists revealed int not null default 0;
-- Kiến thức nền học sinh còn thiếu (AI viết khi chấm phiên có bước được giải hộ), cho giáo viên.
alter table session_evals add column if not exists gaps text[] not null default '{}';
