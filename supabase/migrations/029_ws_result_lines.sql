-- Phản hồi sau khi nộp bài (worksheet): mỗi bước một dòng thay vì dính liền trong một đoạn.
-- Tách các tin cũ dạng "Lần N: đúng x/y bước. Bước 1: ... Bước 2: ..." bằng cách xuống dòng trước từng "Bước k:". Chạy lại nhiều lần vẫn an toàn.
update messages
set content = regexp_replace(content, ' Bước ([0-9]+): ', E'\nBước \\1: ', 'g')
where role = 'bot'
  and meta->>'kind' in ('ws_result', 'done')
  and content ~ '^Lần [0-9]+: đúng [0-9]+/[0-9]+ bước\. Bước [0-9]+: ';
