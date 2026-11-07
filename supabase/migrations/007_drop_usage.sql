-- Bỏ giao diện xem giới hạn AI: hàm gom lượt gọi và cột hạn mức tự nhập không còn dùng.
drop function if exists usage_summary(timestamptz);
alter table teacher_settings drop column if exists daily_limit;
