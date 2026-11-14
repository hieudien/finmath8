-- Dọn cột của các chế độ cũ (từng bước, trắc nghiệm, worksheet). Chat tự do không còn ghi/đọc các cột này.
-- Phiên worksheet còn dở: đánh dấu restarted để không gợi ý làm tiếp (code resume không còn lọc theo mode). Dữ liệu phiên vẫn giữ.
-- Giữ lại revealed, struggled, step, hint_level (thống kê và hồ sơ học sinh của phiên cũ còn đọc). Chạy lại an toàn.
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'chat_sessions' and column_name = 'mode') then
    update chat_sessions set restarted = true where mode = 'worksheet' and not restarted;
  end if;
end $$;
alter table chat_sessions drop column if exists mode;
alter table chat_sessions drop column if exists stall;
alter table chat_sessions drop column if exists wrong;
alter table chat_sessions drop column if exists progress;
alter table chat_sessions drop column if exists draft;
