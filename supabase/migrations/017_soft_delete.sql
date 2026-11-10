-- Không xóa cứng dữ liệu. Xóa liên kết = đặt deleted_at; mọi phiên, tin nhắn, điểm của liên kết vẫn được giữ.
alter table public_links add column if not exists deleted_at timestamptz;

-- RLS: giáo viên không thấy liên kết đã xóa; bảng con (phiên, tin nhắn, điểm, lượt mở) và các view thống kê lọc qua public_links nên tự ẩn theo.
drop policy if exists own_links on public_links;
create policy own_links on public_links for select using (teacher_id = (select auth.uid()) and deleted_at is null);

-- Gỡ job xóa nhật ký quá 30 ngày (008_scale.sql). Bỏ qua nếu project không có pg_cron.
do $$
begin
  perform cron.unschedule('purge-activity-logs');
exception when others then
  raise notice 'không gỡ được job purge-activity-logs: %', sqlerrm;
end $$;

-- Chặn xóa cứng ở tầng DB (kể cả cascade khi xóa tài khoản và TRUNCATE).
create or replace function block_hard_delete() returns trigger language plpgsql as $$
begin
  raise exception 'Không xóa cứng dữ liệu (bảng %). Dùng xóa mềm (deleted_at).', tg_table_name;
end $$;

do $$
declare t text;
begin
  foreach t in array array['teacher_settings','problems','public_links','chat_sessions','messages','session_evals','link_visits','activity_logs','student_advice','session_analysis'] loop
    execute format('drop trigger if exists no_hard_delete on %I', t);
    execute format('create trigger no_hard_delete before delete on %I for each row execute function block_hard_delete()', t);
    execute format('drop trigger if exists no_truncate on %I', t);
    execute format('create trigger no_truncate before truncate on %I for each statement execute function block_hard_delete()', t);
  end loop;
end $$;
