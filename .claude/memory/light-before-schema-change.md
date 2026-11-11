---
name: light-before-schema-change
description: "Thiếu dữ liệu thì thử cách nhẹ (dữ liệu có sẵn, truy vấn khác) trước khi đề xuất đổi DB hoặc thêm migration"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1250c6c6-7f04-4826-8e3c-83f87ab61993
  modified: 2026-11-09T08:24:41.112Z
---

Gặp "thiếu dữ liệu để hiển thị", đi từ nhẹ đến nặng: dữ liệu có sẵn, truy vấn khác, rồi mới đổi schema. Đổi DB (migration, view, cột mới) là lựa chọn cuối, chỉ đề xuất sau khi nêu được vì sao cách nhẹ không đủ.

**Why:** 2026-11-09, cần nhãn cho phiên học sinh chưa nhắn tin. Agent lập kế hoạch thêm migration 016 (view đếm tin) vì `chat_sessions` không có cột đếm. Người dùng hỏi ngược "có cần sửa DB không"; thực ra bảng `messages` đã đủ, PostgREST đếm được bản ghi con (`messages(count)` có lọc `role = 'student'`) trong một lần gọi. Kế hoạch suýt có thêm một migration và một bước chạy lên DB thừa.

**How to apply:**
- Trước khi đề xuất migration, hỏi: dữ liệu đã nằm ở đâu, truy vấn hiện tại có tính được không?
- Cùng họ với [[verify-before-claiming-state]]: đừng theo giả định đầu tiên, kiểm tra trước.
- Dự án này chạy migration thẳng lên Supabase theo CLAUDE.md, nên mỗi migration thừa là một rủi ro thật.
