---
name: test-on-local-3000
description: "Test luôn ở localhost:3000 đang chạy sẵn, không preview_start/dev server mới"
metadata:
  node_type: memory
  type: feedback
  originSessionId: b6048166-d7c9-49b2-88e4-f7df32c134c8
  modified: 2026-11-10T08:34:55.235Z
---

Luôn test ở local `http://localhost:3000` (đã chạy sẵn), không start dev server mới.

**Why:** người dùng đã có server chạy ở cổng 3000; start thêm gây trùng cổng/tốn thời gian.
**How to apply:** dùng `navigate`/`preview_start` với `url: http://localhost:3000`, không dùng `name` từ `.claude/launch.json`, không chạy `npm run dev` bằng Bash.
