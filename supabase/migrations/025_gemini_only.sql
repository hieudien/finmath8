-- Bỏ OpenAI, chỉ dùng Gemini. Giáo viên đang chọn OpenAI chuyển về Gemini (cần nhập lại key Gemini).
update teacher_settings set provider = 'gemini' where provider <> 'gemini';
alter table teacher_settings drop constraint if exists teacher_settings_provider_check;
alter table teacher_settings add constraint teacher_settings_provider_check check (provider = 'gemini');
alter table teacher_settings drop column if exists openai_key_enc;
