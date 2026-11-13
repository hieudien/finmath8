-- Thống kê theo đề của một liên kết: mỗi đề có những học sinh nào và trạng thái từng em.
-- ok = có ít nhất một phiên chấm đúng mà không bị giải hộ bước nào (revealed = 0): tự làm được, một lần là đủ.
-- helped = có phiên đúng nhưng đều có giải hộ; wrong = đã chấm mà chưa phiên nào đúng; none = chưa phiên nào được chấm.
-- Gom trong DB nên không dính giới hạn 1000 dòng của PostgREST. Phiên cũ không có student_code tính từng phiên một.
create or replace function link_problem_stats(p_link uuid) returns jsonb language sql stable security invoker as $$
  with per as (
    select s.problem_code,
      coalesce(s.student_code, 'anon:' || s.id::text) as k,
      (array_agg(s.student_code order by s.started_at desc))[1] as code,
      (array_agg(s.student_name order by s.started_at desc) filter (where s.student_name is not null))[1] as name,
      (array_agg(s.student_class order by s.started_at desc) filter (where s.student_class is not null))[1] as class,
      count(*) as sessions,
      case
        when bool_or(e.final_correct and s.revealed = 0) then 'ok'
        when bool_or(e.final_correct) then 'helped'
        when bool_or(e.session_id is not null) then 'wrong'
        else 'none' end as state
    from chat_sessions s left join session_evals e on e.session_id = s.id
    where s.link_id = p_link
    group by s.problem_code, coalesce(s.student_code, 'anon:' || s.id::text)
  )
  select coalesce(jsonb_agg(jsonb_build_object('code', problem_code, 'students', st) order by problem_code), '[]'::jsonb)
  from (
    select problem_code, jsonb_agg(jsonb_build_object('code', code, 'name', name, 'class', class, 'sessions', sessions, 'state', state)
      order by case state when 'ok' then 0 when 'helped' then 1 when 'wrong' then 2 else 3 end, name nulls last) as st
    from per group by problem_code
  ) t
$$;
