---
name: push
description: Commit toàn bộ thay đổi hiện có và push lên GitHub bằng tài khoản git đã đăng nhập trên máy. Dùng khi người dùng gõ /push hoặc nói "push git".
---

# /push

Commit toàn bộ diff rồi push `origin` bằng tài khoản git đã đăng nhập sẵn trên máy. Không cần token, không đọc `.env`.

## Quy trình

1. `git status --short` và `git diff --stat`. Không có thay đổi và không có commit chờ đẩy: dừng, báo "không có gì để push".
2. Nhìn tên file trong status. Có `.env*`, `*.pem`, file khóa hoặc bí mật: dừng, hỏi người dùng. (`.env*` đã nằm trong `.gitignore`.)
3. Có thay đổi: `git add -A`, rồi commit. Thông điệp ngắn tiếng Việt theo diff (`feat:`/`fix:`/`chore:`), kết thúc bằng dòng đồng tác giả của hệ thống. Chỉ có commit chờ đẩy, không có thay đổi mới: bỏ qua bước này.
4. Push nhánh hiện tại:

```bash
git push origin HEAD
```

5. Báo kết quả: hash commit (`git rev-parse --short HEAD`) và nhánh đã đẩy. Lỗi thì nêu nguyên dòng lỗi.

## Giới hạn cố định

- Không `--force`, không `--no-verify`, không `git remote set-url`.
- Chỉ đẩy nhánh đang đứng.
- Push bị từ chối hoặc lỗi xác thực: báo lại, không tự thử cách khác (đổi remote, tạo token, force).
- Không dùng hay in token/mật khẩu dưới mọi hình thức.
