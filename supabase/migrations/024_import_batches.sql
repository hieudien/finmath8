-- Nạp đề hàng loạt từ tệp Word: mỗi đợt là một dòng. Đề AI làm xong nằm trong cột items (nháp) cho tới khi giáo viên xác nhận,
-- lúc đó mới ghi vào bảng problems. Đồng thời là lịch sử nạp: số đề, số lỗi, lý do lỗi. Server ghi bằng service role; giáo viên chỉ đọc đợt của mình.
create table if not exists import_batches(
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  file_name text not null default '',
  grade int not null check (grade between 1 and 12),
  status text not null default 'draft' check (status in ('draft','confirmed','cancelled')),
  confirmed_at timestamptz,
  sources int not null default 0,          -- số ảnh/đoạn chữ đã đọc trong tệp
  read_errors jsonb not null default '[]', -- [{name, reason}] lỗi lúc đọc tệp, trước khi có đề
  items jsonb not null default '[]');      -- [{statement, answers, steps, status, reason, draft, code}]
create index if not exists import_batches_teacher_idx on import_batches(teacher_id, created_at desc);
alter table import_batches enable row level security;
drop policy if exists own_import_batches on import_batches;
create policy own_import_batches on import_batches for select using (teacher_id = (select auth.uid()));
