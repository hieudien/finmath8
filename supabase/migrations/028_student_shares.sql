-- Liên kết công khai cho phụ huynh xem bài làm, nhận xét, đánh giá của một học sinh (chỉ đọc, không hết hạn).
-- Mỗi học sinh có tối đa một liên kết đang dùng; thu hồi = đặt revoked_at (không xóa cứng), tạo lại sẽ ra liên kết mới.
create table if not exists student_shares(
  token text primary key,
  teacher_id uuid not null references auth.users on delete cascade,
  student_code text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  foreign key (teacher_id, student_code) references students(teacher_id, code));
create unique index if not exists student_shares_one_live on student_shares(teacher_id, student_code) where revoked_at is null;
alter table student_shares enable row level security;
drop policy if exists own_student_shares on student_shares;
create policy own_student_shares on student_shares for select using (teacher_id = (select auth.uid()));
drop trigger if exists no_hard_delete on student_shares;
create trigger no_hard_delete before delete on student_shares for each row execute function block_hard_delete();
drop trigger if exists no_truncate on student_shares;
create trigger no_truncate before truncate on student_shares for each statement execute function block_hard_delete();
