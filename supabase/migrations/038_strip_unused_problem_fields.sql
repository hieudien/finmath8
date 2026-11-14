-- Bỏ các trường đề không còn dùng khỏi problems.content: kết quả chuẩn và sai lầm gắn bước, chỉ dẫn theo bước kiểu cũ, mục tiêu, câu mở rộng, rubric.
-- Chạy lại an toàn (xóa key không có thì không đổi gì).
update problems
set content = content - 'step_checks' - 'error_traps' - 'step_goals' - 'step_hints' - 'learning_objectives' - 'extension' - 'rubric'
where content ?| array['step_checks', 'error_traps', 'step_goals', 'step_hints', 'learning_objectives', 'extension', 'rubric'];
