-- Chịu tải lớn: bộ đếm trên public_links (thay count(*) toàn bảng), số phiên nguyên tử, thống kê gom trong DB, dọn nhật ký cũ.

-- 1. Bộ đếm. Lượt mở và số thứ tự phiên tăng nguyên tử bằng 1 câu update.
alter table public_links add column if not exists visits int not null default 0;
alter table public_links add column if not exists session_count int not null default 0;
update public_links l set
  visits = (select count(*) from link_visits v where v.link_id = l.id),
  session_count = coalesce((select max(seq) from chat_sessions s where s.link_id = l.id), 0);

create or replace function bump_visit(p_link uuid) returns void language sql as $$
  update public_links set visits = visits + 1 where id = p_link;
$$;
create or replace function next_seq(p_link uuid) returns int language sql as $$
  update public_links set session_count = session_count + 1 where id = p_link returning session_count;
$$;
-- Chỉ server (service role) được gọi; khách dùng anon key không tăng được bộ đếm.
revoke execute on function bump_visit(uuid), next_seq(uuid) from public, anon, authenticated;
grant execute on function bump_visit(uuid), next_seq(uuid) to service_role;

-- 2. link_stats dùng bộ đếm, khỏi quét link_visits / chat_sessions để đếm.
create or replace view link_stats with (security_invoker = true) as
  select l.id as link_id,
    l.session_count as sessions,
    (select count(*) from chat_sessions s where s.link_id = l.id and s.status = 'done')::int as done,
    (select coalesce(avg(e.total), 0) from session_evals e join chat_sessions s on s.id = e.session_id where s.link_id = l.id)::float8 as total_avg,
    l.visits as visits
  from public_links l;

-- 3. Thống kê 1 liên kết gom trong DB: PostgREST cắt 1000 dòng nên không tính ở phía app được.
create or replace function link_summary(p_link uuid) returns jsonb language sql stable security invoker as $$
  with s as (select status, started_at from chat_sessions where link_id = p_link),
  e as (select ev.* from session_evals ev join chat_sessions c on c.id = ev.session_id where c.link_id = p_link)
  select jsonb_build_object(
    'sessions', (select count(*) from s),
    'done', (select count(*) filter (where status = 'done') from s),
    'rubric', (select jsonb_build_array(
      jsonb_build_object('name', 'Nhận diện', 'value', round(coalesce(avg(identify), 0)::numeric, 1)),
      jsonb_build_object('name', 'Lập kế hoạch', 'value', round(coalesce(avg(plan), 0)::numeric, 1)),
      jsonb_build_object('name', 'Tính toán', 'value', round(coalesce(avg(calculate), 0)::numeric, 1)),
      jsonb_build_object('name', 'Giải thích', 'value', round(coalesce(avg(explain), 0)::numeric, 1))) from e),
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

-- 4. Index cho giới hạn phiên/ngày theo học sinh và cho việc dọn nhật ký.
create index if not exists chat_sessions_anon_idx on chat_sessions(anon_id, started_at desc);
create index if not exists activity_logs_ts_idx on activity_logs(ts);

-- 5. Dọn nhật ký quá 30 ngày mỗi ngày lúc 20:00 UTC (3:00 sáng giờ VN). Chỉ xóa activity_logs; tin nhắn và điểm giữ nguyên.
-- Nếu project chưa bật pg_cron thì bỏ qua, không làm hỏng migration (bật trong Database > Extensions rồi chạy lại khối này).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('purge-activity-logs', '0 20 * * *', $q$delete from public.activity_logs where ts < now() - interval '30 days'$q$);
exception when others then
  raise notice 'pg_cron không khả dụng: %', sqlerrm;
end $$;
