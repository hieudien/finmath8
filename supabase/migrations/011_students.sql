-- Học sinh nhập mã và tên khi vào liên kết; giáo viên xem điểm yếu từng em.
alter table chat_sessions add column if not exists student_code text;
alter table chat_sessions add column if not exists student_name text;
create index if not exists chat_sessions_student_idx on chat_sessions(link_id, student_code);

-- Gom theo (giáo viên, mã học sinh). security_invoker: RLS chỉ cho giáo viên thấy học sinh của mình.
create or replace view student_stats with (security_invoker = true) as
  select l.teacher_id, s.student_code,
    coalesce(array_agg(distinct s.student_name) filter (where s.student_name is not null), '{}') as names,
    count(*)::int as sessions,
    count(e.session_id)::int as evaluated,
    coalesce(avg(e.identify), 0)::float8 as identify,
    coalesce(avg(e.plan), 0)::float8 as plan,
    coalesce(avg(e.calculate), 0)::float8 as calculate,
    coalesce(avg(e.explain), 0)::float8 as explain,
    coalesce(avg(e.total), 0)::float8 as total_avg,
    coalesce(avg(case when e.final_correct then 100 else 0 end), 0)::float8 as correct_pct,
    coalesce(avg(e.hint_count), 0)::float8 as hint_avg,
    max(s.started_at) as last_at
  from chat_sessions s
  join public_links l on l.id = s.link_id
  left join session_evals e on e.session_id = s.id
  where s.student_code is not null
  group by l.teacher_id, s.student_code;

-- Đề xuất cải thiện do AI tạo, lưu lại để khỏi gọi AI lặp.
create table if not exists student_advice(
  teacher_id uuid not null references auth.users on delete cascade,
  student_code text not null,
  content jsonb not null,
  sessions int not null,
  updated_at timestamptz not null default now(),
  primary key (teacher_id, student_code));
alter table student_advice enable row level security;
drop policy if exists own_advice on student_advice;
create policy own_advice on student_advice for select using (teacher_id = auth.uid());
