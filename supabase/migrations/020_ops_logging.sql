-- Ghi đủ thông tin vận hành: nhật ký lỗi riêng, siêu dữ liệu từng tin của bot, lịch sử bản đề, dọn phiên bỏ dở.
-- Không lưu IP. Không xóa dữ liệu bảng nào (chỉ dọn dòng error_logs quá 30 ngày).

-- 1. Nhật ký lỗi riêng (Cài đặt > Nhật ký lỗi). teacher_id rỗng = lỗi chưa gắn được với giáo viên nào: chỉ admin xem trong DB.
create table if not exists error_logs(
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  ref text not null,
  kind text not null default 'other',
  where_ text not null,
  message text not null,
  stack text,
  actor text not null default 'system' check (actor in ('teacher','student','system')),
  teacher_id uuid references auth.users on delete set null,
  link_id uuid references public_links on delete set null,
  anon_id uuid,
  meta jsonb not null default '{}');
create index if not exists error_logs_teacher_idx on error_logs(teacher_id, id desc);
create index if not exists error_logs_ref_idx on error_logs(ref);
create index if not exists error_logs_ts_idx on error_logs(ts);
alter table error_logs enable row level security;
drop policy if exists own_errors on error_logs;
create policy own_errors on error_logs for select using (teacher_id = (select auth.uid()));

-- 2. Siêu dữ liệu tin của bot: kind (right, wrong, hint, ask, reveal, off_topic, blocked, distress, capped, done, open, stuck, reply), ai_ms (thời gian chờ AI), v (bản code).
alter table messages add column if not exists meta jsonb not null default '{}';

-- 3. Lịch sử bản đề: mỗi lần nội dung đề đổi, bản cũ được chép sang đây (trigger, mọi đường sửa đều được ghi).
create table if not exists problem_versions(
  id bigint generated always as identity primary key,
  problem_id uuid not null references problems on delete cascade,
  teacher_id uuid not null references auth.users on delete cascade,
  version int not null,
  content jsonb not null,
  created_at timestamptz not null default now());
create index if not exists problem_versions_idx on problem_versions(problem_id, version desc);
alter table problem_versions enable row level security;
drop policy if exists own_problem_versions on problem_versions;
create policy own_problem_versions on problem_versions for select using (teacher_id = (select auth.uid()));

create or replace function keep_problem_version() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.content is distinct from old.content then
    insert into problem_versions(problem_id, teacher_id, version, content) values (old.id, old.teacher_id, old.version, old.content);
  end if;
  return new;
end $$;
drop trigger if exists problems_keep_version on problems;
create trigger problems_keep_version before update on problems for each row execute function keep_problem_version();

-- 4. Dọn: phiên "active" im quá 2 giờ thành "abandoned" (ended_at = giờ tin cuối); xóa dòng error_logs quá 30 ngày. Server gọi bằng service role.
create or replace function sweep_abandoned() returns void language sql security definer set search_path = public as $$
  update chat_sessions s
     set status = 'abandoned', ended_at = coalesce((select max(m.ts) from messages m where m.session_id = s.id), s.started_at)
   where s.status = 'active'
     and coalesce((select max(m.ts) from messages m where m.session_id = s.id), s.started_at) < now() - interval '2 hours';
  delete from error_logs where ts < now() - interval '30 days';
$$;
revoke all on function sweep_abandoned() from public, anon, authenticated;
grant execute on function sweep_abandoned() to service_role;

-- 5. Hàm usage_summary (008) đọc action ai_call và quota_hit mà không nơi nào ghi: bỏ. Trang Cài đặt dùng ai_usage_summary (019).
drop function if exists usage_summary(timestamptz);
