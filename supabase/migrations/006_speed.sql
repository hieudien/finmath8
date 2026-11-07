-- Tăng tốc trang giáo viên: gom số liệu ngay trong DB (PostgREST cắt 1000 dòng/truy vấn), thêm index, sửa RLS chậm.
-- Chạy file này TRƯỚC khi triển khai code mới. Mọi view/hàm dùng quyền người gọi nên RLS vẫn lọc theo giáo viên.

-- 1. Index
create index if not exists chat_sessions_started_idx on chat_sessions(started_at desc);
create index if not exists activity_logs_teacher_id_idx on activity_logs(teacher_id, id desc);
create index if not exists activity_logs_teacher_action_ts_idx on activity_logs(teacher_id, action, ts desc);

-- 2. RLS: (select auth.uid()) tính 1 lần thay vì từng dòng; bảng con dùng "in (subquery)" để Postgres hash 1 lần thay vì exists từng dòng.
drop policy if exists own_settings on teacher_settings;
drop policy if exists own_problems on problems;
drop policy if exists own_links on public_links;
drop policy if exists own_sessions on chat_sessions;
drop policy if exists own_messages on messages;
drop policy if exists own_evals on session_evals;
drop policy if exists own_visits on link_visits;
drop policy if exists own_logs on activity_logs;

create policy own_settings on teacher_settings for select using (teacher_id = (select auth.uid()));
create policy own_problems on problems for select using (teacher_id = (select auth.uid()));
create policy own_links on public_links for select using (teacher_id = (select auth.uid()));
create policy own_sessions on chat_sessions for select using (link_id in (select id from public_links where teacher_id = (select auth.uid())));
create policy own_messages on messages for select using (session_id in (select s.id from chat_sessions s where s.link_id in (select id from public_links where teacher_id = (select auth.uid()))));
create policy own_evals on session_evals for select using (session_id in (select s.id from chat_sessions s where s.link_id in (select id from public_links where teacher_id = (select auth.uid()))));
create policy own_visits on link_visits for select using (link_id in (select id from public_links where teacher_id = (select auth.uid())));
create policy own_logs on activity_logs for select using (teacher_id = (select auth.uid()));

-- 3. Thống kê từng liên kết (trang Thống kê, danh sách)
create or replace view link_stats with (security_invoker = true) as
  select l.id as link_id,
    (select count(*) from chat_sessions s where s.link_id = l.id)::int as sessions,
    (select count(*) from chat_sessions s where s.link_id = l.id and s.status = 'done')::int as done,
    (select coalesce(avg(e.total), 0) from session_evals e join chat_sessions s on s.id = e.session_id where s.link_id = l.id)::float8 as total_avg,
    (select count(*) from link_visits v where v.link_id = l.id)::int as visits
  from public_links l;

-- 4. Tổng quan toàn bộ (trang Tổng quan)
create or replace view overview_stats with (security_invoker = true) as
  select
    (select count(*) from chat_sessions)::int as sessions,
    (select count(*) from chat_sessions where status = 'done')::int as done,
    (select count(*) from session_evals)::int as evals,
    (select coalesce(avg(total), 0) from session_evals)::float8 as total_avg,
    (select coalesce(avg(case when final_correct then 100 else 0 end), 0) from session_evals)::float8 as correct_pct,
    (select coalesce(avg(duration_s), 0) from session_evals)::float8 as duration_s,
    (select coalesce(avg(hint_count), 0) from session_evals)::float8 as hint_avg;

create or replace view error_counts with (security_invoker = true) as
  select x as name, count(*)::int as value from session_evals, unnest(errors) as x group by x;

-- 5. So sánh theo nhãn liên kết (pre/post, control/experiment): n, trung bình, phương sai mẫu, độ lệch chuẩn tổng thể
create or replace view tag_stats with (security_invoker = true) as
  select l.tag, count(*)::int as n, avg(e.total)::float8 as mean,
    coalesce(var_samp(e.total), 0)::float8 as var_samp, coalesce(stddev_pop(e.total), 0)::float8 as sd_pop
  from session_evals e join chat_sessions s on s.id = e.session_id join public_links l on l.id = s.link_id
  where l.tag is not null group by l.tag;

-- 6. Dùng AI hôm nay: gom theo action + model ngay trong DB thay vì kéo 5000 dòng nhật ký
create or replace function usage_summary(since timestamptz)
returns table(action text, model text, n int, in_tok bigint, out_tok bigint, last_ts timestamptz)
language sql stable security invoker as $$
  select a.action, a.meta->>'model', count(*)::int,
    coalesce(sum((a.meta->>'in')::bigint), 0), coalesce(sum((a.meta->>'out')::bigint), 0), max(a.ts)
  from activity_logs a
  where a.action in ('ai_call', 'model_fallback', 'quota_hit') and a.ts >= since
  group by a.action, a.meta->>'model'
$$;
