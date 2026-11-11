// Quy tắc trình bày dùng chung cho mọi prompt AI sinh chữ có công thức (lời giải, gợi ý, đề...). Không chứa dấu gạch chéo ngược để model khỏi rối.
export const FORMAT_RULE = `
TRÌNH BÀY: MỌI biểu thức toán (kể cả đơn giản như $x = 2$, $m = -6$, $(x; y) = (2; 1)$) đặt trong $...$ theo LaTeX. Hệ phương trình dùng cases trong MỘT cặp $...$ trên một dòng, không viết "Hệ:" trước, số hiệu (I) viết ngay sau hệ. Phân số dùng frac, không dùng left hoặc right. Không dùng ký tự gạch chéo ngược hay ¦ ở ngoài công thức.`;

// Chỉ thêm vào prompt bắt model trả JSON.
export const FORMAT_JSON = " Không xuống dòng trong một chuỗi JSON.";
