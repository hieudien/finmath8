---
name: landing
description: Lập kế hoạch cập nhật landing page, README và menu Hướng dẫn theo hệ thống mới nhất. Chỉ plan, không sửa file. Dùng khi người dùng gõ /landing hoặc nói "cập nhật landing", "đổi README theo hệ thống mới".
---

# /landing

Lập kế hoạch đưa 3 nơi về đúng với hệ thống đang chạy. **Chỉ plan**: không sửa file, không chạy lệnh làm thay đổi gì. Chỉ khi người dùng nói "ok" ở lượt sau thì mới thực hiện kế hoạch (ngoài skill này).

Ba đích:
- `app/page.tsx`: landing page.
- `README.md`.
- `app/dashboard/guide/page.tsx`: menu Hướng dẫn.

## Quy trình

1. **Đọc hiện trạng hệ thống, không dựa vào trí nhớ.** Dùng Read/Grep/Glob và `git log --oneline -20`:
   - `supabase/migrations/`: tên file mới nhất cho biết tính năng nào đã vào DB.
   - `lib/models.ts`: nhà cung cấp AI đang hỗ trợ.
   - `app/dashboard/`: các trang giáo viên đang có (đề, liên kết, học sinh, thống kê, nhật ký, cài đặt, hướng dẫn).
   - `app/api/`: các action (ví dụ trong `app/api/problems/route.ts`: tạo lời giải, tạo gợi ý từng bước, hoàn thiện đề hàng loạt).
   - `lib/chat/`, `lib/schema/problem.ts`: cách chatbot chấm bước, các trường của đề.
   - Rút ra **danh sách tính năng thật** mà giáo viên và học sinh dùng được.
2. **Đọc 3 đích**, ghi lại từng chỗ: lỗi thời, thiếu, nói sai, hoặc mô tả tính năng đã bỏ.
3. **Lập bảng đối chiếu theo từng đích**: tính năng | đích đã nói đúng chưa | cần thêm hoặc sửa gì. Giữ giọng văn và cấu trúc hiện có của từng trang, chỉ đề xuất đổi khi cần.
4. **Đầu ra**: kế hoạch ngắn gọn theo từng file (mục nào thêm, sửa, xóa; ý chính của đoạn mới), kèm 1-2 câu hỏi nếu có chỗ phải chọn. Kết thúc bằng: "Nói ok để làm."

## Quy tắc cố định

- Chỉ mô tả điều code thực sự làm. Gặp điều không chắc thì đánh dấu để hỏi, không đoán.
- Không nêu số liệu hiệu năng (nhanh hơn bao nhiêu, tiết kiệm bao nhiêu) nếu chưa có số đo thật.
- Không đụng DB, `.env`, cấu hình hay migration.
- Văn bản dành cho giáo viên: tiếng Việt, dễ hiểu, không thuật ngữ kỹ thuật (nói "ô nhập từng bước", không nói "engine" hay "checkpoint").
- README viết cho người cài đặt và vận hành, landing và Hướng dẫn viết cho giáo viên: không trộn đối tượng.
