-- Nhận xét của AI cho từng phiên (giáo viên bấm "AI phân tích phiên này"), lưu lại để khỏi gọi AI lặp.
create table if not exists session_analysis(
  session_id uuid primary key references chat_sessions on delete cascade,
  content jsonb not null,
  updated_at timestamptz not null default now());
alter table session_analysis enable row level security;
drop policy if exists own_session_analysis on session_analysis;
create policy own_session_analysis on session_analysis for select using (exists(select 1 from chat_sessions s join public_links l on l.id = s.link_id where s.id = session_id and l.teacher_id = auth.uid()));
