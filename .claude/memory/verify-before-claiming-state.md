---
name: verify-before-claiming-state
description: Kiểm tra chỉ-đọc trước khi khẳng định trạng thái DB hoặc hệ thống ngoài; đừng suy từ việc lệnh của mình thất bại
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1250c6c6-7f04-4826-8e3c-83f87ab61993
  modified: 2026-11-11T02:43:56.468Z
---

Không khẳng định trạng thái DB/hệ thống ngoài (bảng đã có chưa, migration đã chạy chưa) nếu chưa kiểm tra. Lệnh của agent thất bại không có nghĩa việc đó chưa xảy ra.

**Why:** 2026-11-09, migration 015 (`session_analysis`) bị chặn khi nối Postgres (lỗi chứng chỉ TLS). Agent báo "chưa chạy" suốt hai lượt và bắt người dùng chọn cách chạy, nhưng bảng thực ra đã có (người dùng chạy tay hoặc đường khác). Một lệnh chỉ-đọc qua REST bằng khóa anon (`GET /rest/v1/<bảng>?limit=1`: `[]` + HTTP 200 là có bảng, 404 `PGRST205` là chưa) là đủ để biết ngay.

**How to apply:**
- Migration bị chặn: chạy kiểm tra chỉ-đọc trước khi báo kết quả hay hỏi người dùng.
- Không kiểm tra được thì nói rõ là suy đoán ("lệnh của tôi thất bại, chưa biết bảng đã có chưa"), không nói như sự thật.
- Đừng hỏi người dùng một quyết định mà một lệnh kiểm tra rẻ có thể làm câu hỏi đó thừa.
- Khóa anon không đọc được policy RLS: nói rõ phần không xác minh được.
- Lặp lại lần 2 (cùng ngày, cùng migration 015): thấy file chưa commit rồi suy ra "chưa chạy" và đề xuất chạy luôn. File chưa commit không nói gì về DB. Khi `git status` hiện migration mới, kiểm tra REST trước khi nhắc tới nó.
- Tách "kiểm tra" khỏi "hành động" trong các nút hỏi: đừng gộp "kiểm tra + chạy migration" thành một lựa chọn. Chỉ đề xuất chạy sau khi kiểm tra cho thấy bảng chưa có.
- Lần 3 (2026-11-11, migration 023): sau khi push, báo "migration chưa chạy" chỉ vì file nằm trong `git status` là untracked. DB thực ra đã có cột. Đây là lỗi lặp lại: ĐỌC memory này TRƯỚC khi viết bất kỳ câu nào về trạng thái migration/DB, kể cả câu nhắc cuối lượt. Không chắc thì bỏ câu đó, đừng viết.
- Thiếu `psql`/`pg` thì dùng REST anon (đã liệt kê ở Why), đừng coi là hết đường kiểm tra.
