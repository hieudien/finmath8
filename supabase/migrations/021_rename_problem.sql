-- Đổi mã đề: cập nhật đề, bản chụp đề trong liên kết và mã đề của các phiên chat cũ trong một giao dịch.
create or replace function rename_problem(p_id uuid, p_teacher uuid, p_code text) returns void language plpgsql set search_path = public as $$
declare old_code text;
begin
  select code into old_code from problems where id = p_id and teacher_id = p_teacher and deleted_at is null for update;
  if old_code is null then raise exception 'Không tìm thấy đề.'; end if;
  if old_code = p_code then return; end if;
  if exists (select 1 from problems where teacher_id = p_teacher and code = p_code and deleted_at is null) then
    raise exception 'Mã đề % đã có. Chọn mã khác.', p_code;
  end if;
  update problems set code = p_code, content = jsonb_set(content, '{id}', to_jsonb(p_code)), version = version + 1, updated_at = now() where id = p_id;
  update public_links set problems_snapshot = (
      select jsonb_agg(case when e->>'id' = old_code then jsonb_set(e, '{id}', to_jsonb(p_code)) else e end order by ord)
      from jsonb_array_elements(problems_snapshot) with ordinality as t(e, ord))
    where teacher_id = p_teacher and problems_snapshot @> jsonb_build_array(jsonb_build_object('id', old_code));
  update chat_sessions set problem_code = p_code
    where problem_code = old_code and link_id in (select id from public_links where teacher_id = p_teacher);
end $$;
revoke execute on function rename_problem(uuid, uuid, text) from public, anon, authenticated;
