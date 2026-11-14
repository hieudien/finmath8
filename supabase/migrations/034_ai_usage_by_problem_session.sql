-- Token AI theo đề và theo phiên. lib/teacher.ts (withCtx) ghi thêm vào meta của dòng ai_usage: session_id (phiên làm bài) và problem (mã đề).
-- Dòng cũ không có hai trường này nên không vào thống kê. Dòng có problem mà không có session_id là token chuẩn bị đề (chuẩn hóa, kiểm đáp án, phân loại...).
-- security invoker: RLS own_logs chỉ cho thấy dòng của chính giáo viên. Cộng trong SQL vì PostgREST chỉ trả tối đa 1000 dòng.
create index if not exists activity_logs_usage_problem on public.activity_logs ((meta->>'problem')) where action = 'ai_usage';
create index if not exists activity_logs_usage_session on public.activity_logs ((meta->>'session_id')) where action = 'ai_usage';

-- Mỗi đề hai dòng: kind = 'prep' (chuẩn bị đề, một lần) và 'session' (tất cả phiên làm bài, kèm số phiên).
create or replace function public.ai_usage_by_problem(days int default 30)
returns table(problem text, kind text, sessions bigint, calls bigint, input bigint, cached bigint, output bigint, thoughts bigint)
language sql stable security invoker as $$
  select meta->>'problem',
    case when meta ? 'session_id' then 'session' else 'prep' end,
    count(distinct meta->>'session_id'), count(*),
    coalesce(sum((meta->>'input')::bigint), 0), coalesce(sum((meta->>'cached')::bigint), 0),
    coalesce(sum((meta->>'output')::bigint), 0), coalesce(sum((meta->>'thoughts')::bigint), 0)
  from public.activity_logs
  where action = 'ai_usage' and meta ? 'problem' and teacher_id = (select auth.uid()) and ts > now() - make_interval(days => days)
  group by 1, 2;
$$;

-- Mỗi phiên một dòng.
create or replace function public.ai_usage_by_session(days int default 30)
returns table(session_id uuid, calls bigint, input bigint, cached bigint, output bigint, thoughts bigint)
language sql stable security invoker as $$
  select (meta->>'session_id')::uuid, count(*),
    coalesce(sum((meta->>'input')::bigint), 0), coalesce(sum((meta->>'cached')::bigint), 0),
    coalesce(sum((meta->>'output')::bigint), 0), coalesce(sum((meta->>'thoughts')::bigint), 0)
  from public.activity_logs
  where action = 'ai_usage' and meta ? 'session_id' and teacher_id = (select auth.uid()) and ts > now() - make_interval(days => days)
  group by 1;
$$;

grant execute on function public.ai_usage_by_problem(int) to authenticated;
grant execute on function public.ai_usage_by_session(int) to authenticated;
