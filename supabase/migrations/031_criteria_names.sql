-- Đổi tên 4 tiêu chí trong thống kê liên kết (khóa cột identify/plan/calculate/explain giữ nguyên).
create or replace function link_summary(p_link uuid) returns jsonb language sql stable security invoker as $$
  with s as (select status, started_at from chat_sessions where link_id = p_link),
  e as (select ev.* from session_evals ev join chat_sessions c on c.id = ev.session_id where c.link_id = p_link)
  select jsonb_build_object(
    'sessions', (select count(*) from s),
    'done', (select count(*) filter (where status = 'done') from s),
    'rubric', (select jsonb_build_array(
      jsonb_build_object('name', 'Hiểu đề bài', 'value', round(coalesce(avg(identify), 0)::numeric, 1)),
      jsonb_build_object('name', 'Lập kế hoạch giải', 'value', round(coalesce(avg(plan), 0)::numeric, 1)),
      jsonb_build_object('name', 'Thực hiện kế hoạch', 'value', round(coalesce(avg(calculate), 0)::numeric, 1)),
      jsonb_build_object('name', 'Kiểm tra và đánh giá', 'value', round(coalesce(avg(explain), 0)::numeric, 1))) from e),
    'totalAvg', (select round(coalesce(avg(total), 0)::numeric, 1) from e),
    'correctPct', (select round(coalesce(avg(case when final_correct then 100 else 0 end), 0)::numeric) from e),
    'durationMin', (select round(coalesce(avg(duration_s), 0)::numeric / 60, 1) from e),
    'hintAvg', (select round(coalesce(avg(hint_count), 0)::numeric, 1) from e),
    'totalDist', (select coalesce(jsonb_agg(jsonb_build_object('name', total::text, 'value', n) order by total), '[]') from (select total, count(*) n from e group by total) t),
    'hintDist', (select coalesce(jsonb_agg(jsonb_build_object('name', 'Mức ' || max_hint_level, 'value', n) order by max_hint_level), '[]') from (select max_hint_level, count(*) n from e group by max_hint_level) t),
    'errors', (select coalesce(jsonb_agg(jsonb_build_object('name', x, 'value', n) order by n desc, x), '[]') from (select x, count(*) n from e, unnest(e.errors) x group by x) t),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('name', to_char(d, 'MM-DD'), 'value', n) order by d), '[]') from (select (started_at at time zone 'UTC')::date d, count(*) n from s group by 1) t),
    'likertAvg', (select round(avg(survey_likert)::numeric, 1) from e where survey_likert is not null),
    'likertN', (select count(survey_likert) from e)
  )
$$;
