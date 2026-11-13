-- Mỗi liên kết một chế độ làm bài cố định (chọn lúc tạo, không đổi sau đó).
-- steps: chat từng bước. worksheet: làm theo bước rồi nộp cả bài.
alter table public_links add column if not exists mode text not null default 'steps' check (mode in ('steps','worksheet'));

-- Liên kết đã tạo: lấy theo chế độ giáo viên đang chọn, để học sinh không thấy giao diện đổi bất ngờ. Chạy lại an toàn.
update public_links l set mode = ts.interaction_mode
from teacher_settings ts
where ts.teacher_id = l.teacher_id and ts.interaction_mode in ('steps','worksheet') and l.mode <> ts.interaction_mode;
