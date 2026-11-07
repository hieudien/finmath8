-- Học sinh tự đánh giá mức hiểu bài (1-5) cuối phiên, để đối chiếu với điểm chấm (tránh học sinh tin mình giỏi hơn thực tế).
alter table session_evals add column if not exists confidence int check (confidence between 1 and 5);
