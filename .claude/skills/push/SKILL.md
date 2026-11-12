---
name: push
description: Commit toàn bộ thay đổi hiện có và push thẳng lên nhánh main của GitHub bằng tài khoản git đã đăng nhập trên máy. Dùng khi người dùng gõ /push hoặc nói "push git".
---

# /push

Commit toàn bộ diff rồi push thẳng lên `origin/main` bằng tài khoản git đã đăng nhập sẵn trên máy, dù đang đứng ở nhánh nào. Không tạo PR. Không cần token, không đọc `.env`.

## Quy trình

1. `git fetch origin main`, rồi `git status --short` và `git diff --stat`. Không có thay đổi và `git log origin/main..HEAD` rỗng (không có commit chờ đẩy): dừng, báo "không có gì để push".
2. Nhìn tên file trong status. Có `.env*`, `*.pem`, file khóa hoặc bí mật: dừng, hỏi người dùng. (`.env*` đã nằm trong `.gitignore`.)
3. Có thay đổi: `git add -A`, rồi commit. Thông điệp ngắn tiếng Việt theo diff (`feat:`/`fix:`/`chore:`), kết thúc bằng dòng đồng tác giả của hệ thống. Chỉ có commit chờ đẩy, không có thay đổi mới: bỏ qua bước này.
4. Push thẳng lên `main` (từ nhánh hiện tại, kể cả khi không đứng ở `main`):

```bash
git push origin HEAD:main
```

5. Báo kết quả: hash commit (`git rev-parse --short HEAD`), nhánh đang đứng và nhắc đã đẩy lên `origin/main`. Lỗi thì nêu nguyên dòng lỗi.

## Giới hạn cố định

- Không `--force`, không `--force-with-lease`, không `--no-verify`, không `git remote set-url`.
- Chỉ đẩy lên `main`, không đẩy nhánh khác, không xóa nhánh trên remote.
- Push lên `main` bị từ chối (ví dụ `non-fast-forward` vì `main` trên remote có commit mà nhánh hiện tại chưa có): báo lại nguyên lỗi, không tự `merge`, `rebase` hay thử cách khác. Để người dùng quyết định.
- Push bị từ chối hoặc lỗi xác thực: báo lại, không tự thử cách khác (đổi remote, tạo token, force).
- Không dùng hay in token/mật khẩu dưới mọi hình thức.
