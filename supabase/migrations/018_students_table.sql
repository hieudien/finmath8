-- Học sinh có bảng riêng, không phụ thuộc liên kết hay phiên: xóa liên kết thì học sinh vẫn còn.
-- Xóa học sinh = đặt deleted_at (xóa mềm). Học sinh vào bài lại bằng cùng mã thì tự hiện lại.
create table if not exists students(
  teacher_id uuid not null references auth.users on delete cascade,
  code text not null,
  name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (teacher_id, code));
alter table students enable row level security;
drop policy if exists own_students on students;
create policy own_students on students for select using (teacher_id = (select auth.uid()) and deleted_at is null);

-- Lấy học sinh từ các phiên đã có (kể cả phiên của liên kết đã xóa mềm).
insert into students(teacher_id, code, name, created_at, last_seen_at)
  select l.teacher_id, s.student_code,
    (array_agg(s.student_name order by s.started_at desc) filter (where s.student_name is not null))[1],
    min(s.started_at), max(s.started_at)
  from chat_sessions s join public_links l on l.id = s.link_id
  where s.student_code is not null
  group by l.teacher_id, s.student_code
  on conflict do nothing;

-- Thống kê theo học sinh: lấy danh sách từ students, phiên của liên kết đã xóa tự bị RLS ẩn nên học sinh hiện 0 phiên chứ không biến mất.
create or replace view student_stats with (security_invoker = true) as
  select st.teacher_id, st.code as student_code,
    case when st.name is null then '{}'::text[] else array[st.name] end as names,
    count(s.id)::int as sessions,
    count(e.session_id)::int as evaluated,
    coalesce(avg(e.identify), 0)::float8 as identify,
    coalesce(avg(e.plan), 0)::float8 as plan,
    coalesce(avg(e.calculate), 0)::float8 as calculate,
    coalesce(avg(e.explain), 0)::float8 as explain,
    coalesce(avg(e.total), 0)::float8 as total_avg,
    coalesce(avg(case when e.final_correct then 100 else 0 end), 0)::float8 as correct_pct,
    coalesce(avg(e.hint_count), 0)::float8 as hint_avg,
    coalesce(max(s.started_at), st.last_seen_at) as last_at
  from students st
  left join (chat_sessions s join public_links l on l.id = s.link_id)
    on l.teacher_id = st.teacher_id and s.student_code = st.code
  left join session_evals e on e.session_id = s.id
  group by st.teacher_id, st.code, st.name, st.last_seen_at;

-- Chặn xóa cứng như 017.
drop trigger if exists no_hard_delete on students;
create trigger no_hard_delete before delete on students for each row execute function block_hard_delete();
drop trigger if exists no_truncate on students;
create trigger no_truncate before truncate on students for each statement execute function block_hard_delete();
