-- Đếm lượt mở theo liên kết ngay trong DB: PostgREST chỉ trả tối đa 1000 dòng mỗi truy vấn nên không đếm ở phía app được.
create or replace view link_visit_counts with (security_invoker = true) as
  select link_id, count(*)::int as n from link_visits group by link_id;
