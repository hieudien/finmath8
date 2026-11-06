create extension if not exists pgcrypto;

create table teacher_settings(
  teacher_id uuid primary key references auth.users on delete cascade,
  gemini_key_enc text,
  model text not null default 'gemini-3.5-flash',
  temperature real not null default 0.3,
  updated_at timestamptz not null default now());

create table problems(
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users on delete cascade,
  code text not null,
  content jsonb not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz);
create index on problems(teacher_id) where deleted_at is null;

create table public_links(
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users on delete cascade,
  slug text not null unique,
  label text not null,
  tag text check (tag in ('pre','post','experiment','control')),
  problems_snapshot jsonb not null,
  active boolean not null default true,
  expires_at timestamptz,
  max_messages int not null default 40,
  created_at timestamptz not null default now());
create index on public_links(teacher_id);

create table chat_sessions(
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public_links on delete cascade,
  anon_id uuid not null,
  seq int not null,
  problem_code text not null,
  step int not null default 1,
  hint_level int not null default 1,
  status text not null default 'active' check (status in ('active','done','abandoned')),
  started_at timestamptz not null default now(),
  ended_at timestamptz);
create index on chat_sessions(link_id);

create table messages(
  id bigint generated always as identity primary key,
  session_id uuid not null references chat_sessions on delete cascade,
  role text not null check (role in ('student','bot')),
  content text not null,
  step int, hint_level int,
  ts timestamptz not null default now());
create index on messages(session_id, id);

create table session_evals(
  session_id uuid primary key references chat_sessions on delete cascade,
  identify int not null, plan int not null, calculate int not null, explain int not null,
  total int not null,
  final_correct boolean not null,
  max_hint_level int not null,
  hint_count int not null,
  errors text[] not null default '{}',
  duration_s int not null,
  survey_likert int check (survey_likert between 1 and 5));

create table link_visits(
  id bigint generated always as identity primary key,
  link_id uuid not null references public_links on delete cascade,
  ts timestamptz not null default now());
create index on link_visits(link_id, ts);

create table activity_logs(
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  actor_type text not null check (actor_type in ('teacher','student','system')),
  teacher_id uuid references auth.users on delete set null,
  anon_id uuid,
  link_id uuid references public_links on delete set null,
  action text not null,
  meta jsonb not null default '{}');
create index on activity_logs(teacher_id, ts desc);
create index on activity_logs(link_id, ts desc);

-- RLS: giáo viên đọc dữ liệu của mình. Ghi qua service role ở server.
alter table teacher_settings enable row level security;
alter table problems enable row level security;
alter table public_links enable row level security;
alter table chat_sessions enable row level security;
alter table messages enable row level security;
alter table session_evals enable row level security;
alter table link_visits enable row level security;
alter table activity_logs enable row level security;

create policy own_settings on teacher_settings for select using (teacher_id = auth.uid());
create policy own_problems on problems for select using (teacher_id = auth.uid());
create policy own_links on public_links for select using (teacher_id = auth.uid());
create policy own_sessions on chat_sessions for select using (exists(select 1 from public_links l where l.id = link_id and l.teacher_id = auth.uid()));
create policy own_messages on messages for select using (exists(select 1 from chat_sessions s join public_links l on l.id = s.link_id where s.id = session_id and l.teacher_id = auth.uid()));
create policy own_evals on session_evals for select using (exists(select 1 from chat_sessions s join public_links l on l.id = s.link_id where s.id = session_id and l.teacher_id = auth.uid()));
create policy own_visits on link_visits for select using (exists(select 1 from public_links l where l.id = link_id and l.teacher_id = auth.uid()));
create policy own_logs on activity_logs for select using (teacher_id = auth.uid());
