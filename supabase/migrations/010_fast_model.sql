-- Model mặc định đổi sang bản nhanh nhất. Chỉ đổi cài đặt đang dùng model cũ mặc định, không đụng lựa chọn riêng của giáo viên.
alter table teacher_settings alter column model set default 'gemini-3.1-flash-lite';
update teacher_settings set model = 'gemini-3.1-flash-lite' where provider = 'gemini' and model = 'gemini-3.5-flash';
