alter table teacher_settings add column if not exists provider text not null default 'gemini' check (provider in ('gemini','openai'));
alter table teacher_settings add column if not exists openai_key_enc text;
