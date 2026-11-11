---
name: no-script-edits
description: "Không dùng script (python, sed, node...) để sửa file; chỉ dùng công cụ Edit/Write"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 39b28cfd-2c42-41f8-9693-a74842961dad
  modified: 2026-11-11T02:10:49.349Z
---

Không bao giờ dùng script (python, sed, node, heredoc...) để sửa file trong repo. Chỉ dùng công cụ Edit hoặc Write.

**Why:** Phiên chuẩn hóa đề: script python thay chuỗi làm hỏng file (`verify-solution.ts` thành chuỗi chưa đóng, `fill.ts` có CRLF nên thay không khớp, escape `\` sai), mất nhiều lượt để sửa lại. Người dùng đã yêu cầu ghi nhớ.

**How to apply:** Mọi thay đổi code/test/tài liệu dùng Edit (chuỗi một dòng nếu file CRLF) hoặc Write. Bash chỉ để chạy lệnh đọc/kiểm tra (tsc, vitest, git status), không để ghi file dự án. Xem [[verify-before-claiming-state]] cho nguyên tắc kiểm tra trước khi khẳng định.
