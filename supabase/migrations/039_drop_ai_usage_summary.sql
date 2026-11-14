-- Bỏ phần "Token đã dùng" ở Cài đặt (đã xóa AiCost): hàm tổng hợp theo khoảng ngày không còn ai gọi.
-- ai_usage_by_problem và ai_usage_by_session vẫn dùng ở trang Thống kê. Chạy lại an toàn.
drop function if exists public.ai_usage_summary(int);
