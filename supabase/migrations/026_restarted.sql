-- Học sinh chọn "Làm lại mới" cho một bài làm dở: phiên cũ không còn được gợi ý làm tiếp (vẫn giữ làm dữ liệu cho giáo viên).
alter table chat_sessions add column if not exists restarted boolean not null default false;
create index if not exists chat_sessions_resume_idx on chat_sessions(link_id, student_code, problem_code, started_at desc) where not restarted;
