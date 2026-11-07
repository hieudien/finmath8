---
name: push
description: Commit toàn bộ thay đổi hiện có và push lên GitHub bằng git_token trong .env. Dùng khi người dùng gõ /push hoặc nói "push git".
---

# /push

Commit toàn bộ diff rồi push `origin` bằng `git_token` trong `.env`. Không bao giờ in token ra, không lưu token vào `.git/config`.

## Quy trình

1. `git status --short` và `git diff --stat`. Không có thay đổi và không có commit chờ đẩy: dừng, báo "không có gì để push".
2. Nhìn tên file trong status. Có `.env*`, `*.pem`, file khóa hoặc bí mật: dừng, hỏi người dùng. (`.env*` đã nằm trong `.gitignore`.)
3. Có thay đổi: `git add -A`, rồi commit. Thông điệp ngắn tiếng Việt theo diff (`feat:`/`fix:`/`chore:`), kết thúc bằng dòng đồng tác giả của hệ thống. Chỉ có commit chờ đẩy, không có thay đổi mới: bỏ qua bước này.
4. Push bằng token đọc từ `.env`, trong cùng một lệnh Bash:

```bash
cd "$(git rev-parse --show-toplevel)"
TOKEN=$(grep -E '^git_token=' .env | head -1 | cut -d= -f2- | tr -d '\r\n"' | xargs)
[ -n "$TOKEN" ] || { echo "Thiếu git_token trong .env"; exit 1; }
REPO=$(git remote get-url origin | sed -E 's#^git@github.com:#https://github.com/#; s#^https://[^@/]*@#https://#; s#\.git$##')
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git push "https://x-access-token:${TOKEN}@${REPO#https://}.git" "HEAD:refs/heads/${BRANCH}" 2>&1 | sed "s/${TOKEN}/***/g"
```

5. Báo kết quả: hash commit (`git rev-parse --short HEAD`) và nhánh đã đẩy. Lỗi thì chỉ nêu dòng lỗi đã che token.

## Giới hạn cố định

- Không `--force`, không `--no-verify`, không `git remote set-url`.
- Chỉ đẩy nhánh đang đứng.
- Push bị từ chối hoặc lỗi xác thực: báo lại, không tự thử cách khác (đổi remote, tạo token, force).
- Không ghi token vào file, log, commit hay câu trả lời.
