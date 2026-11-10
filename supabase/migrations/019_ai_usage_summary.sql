-- Gộp số token đã dùng của giáo viên đang đăng nhập theo nhà cung cấp, model và mục đích (meta.use) cho trang Cài đặt.
-- Dòng ai_usage do lib/teacher.ts ghi mỗi lượt gọi AI. security invoker: RLS own_logs chỉ cho thấy dòng của chính giáo viên.
-- Không đổi bảng nào; PostgREST chỉ trả tối đa 1000 dòng nên phải cộng trong SQL.
create or replace function public.ai_usage_summary(days int default 30)
returns table(provider text, model text, use text, calls bigint, input bigint, cached bigint, output bigint, thoughts bigint)
language sql stable security invoker as $$
  select meta->>'provider', meta->>'model', coalesce(meta->>'use', ''), count(*),
    coalesce(sum((meta->>'input')::bigint), 0), coalesce(sum((meta->>'cached')::bigint), 0),
    coalesce(sum((meta->>'output')::bigint), 0), coalesce(sum((meta->>'thoughts')::bigint), 0)
  from public.activity_logs
  where action = 'ai_usage' and teacher_id = (select auth.uid()) and ts > now() - make_interval(days => days)
  group by 1, 2, 3;
$$;

grant execute on function public.ai_usage_summary(int) to authenticated;
