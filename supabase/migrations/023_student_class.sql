-- Học sinh nhập tên và lớp, không nhập mã. Lớp lưu riêng; student_code là khóa nội bộ do server sinh từ tên + lớp.
alter table chat_sessions add column if not exists student_class text;
alter table students add column if not exists class text;

-- Học sinh cũ chưa có lớp: để null, hiện "chưa có lớp".
-- Thêm cột cuối view (create or replace view chỉ cho thêm cột ở cuối).
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
    coalesce(max(s.started_at), st.last_seen_at) as last_at,
    st.class as student_class
  from students st
  left join (chat_sessions s join public_links l on l.id = s.link_id)
    on l.teacher_id = st.teacher_id and s.student_code = st.code
  left join session_evals e on e.session_id = s.id
  group by st.teacher_id, st.code, st.name, st.class, st.last_seen_at;
