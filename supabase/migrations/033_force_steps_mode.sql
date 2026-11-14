-- Tạm ẩn chế độ worksheet: mọi liên kết và mặc định của giáo viên đều là chat từng bước. Ràng buộc check giữ nguyên để bật lại sau. Chạy lại an toàn.
update public_links set mode = 'steps' where mode <> 'steps';
update teacher_settings set interaction_mode = 'steps' where interaction_mode is distinct from 'steps';
