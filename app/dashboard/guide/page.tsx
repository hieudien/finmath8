const BLOCKS: [string, string[]][] = [
  ["Chuẩn bị bài học", [
    "Chọn 2–3 tình huống phù hợp nội dung sắp dạy, nạp vào mục Đề bài.",
    "Giới thiệu chatbot: \"Chatbot gợi ý từng bước, em cố gắng trả lời trước khi xin gợi ý\".",
    "Mỗi học sinh tự làm riêng trên thiết bị của mình.",
  ]],
  ["Kiểu làm bài", [
    "Từng bước: học sinh nộp một bước giải mỗi lần vào ô ngắn. Nhanh hơn, ít lạc đề. Có nút Em chưa hiểu để hỏi khi chưa rõ đề hoặc cách bắt đầu.",
    "Đề thiếu lời giải từng bước sẽ tự chạy kiểu Chat: học sinh nhắn tin tự do với chatbot.",
  ]],
  ["Chuẩn bị đề cho kiểu Từng bước", [
    "Đề cần có lời giải từng bước. Nếu chưa có, bấm \"Tạo lời giải bằng AI\" ở trang đề.",
    "Bấm \"Tạo chỉ dẫn từng bước\" (ở danh sách đề hoặc trang từng đề) để AI viết việc cần làm và 3 mức gợi ý cho từng bước.",
    "Đọc lại lời giải và đáp án AI viết.",
    "Đề thiếu lời giải từng bước sẽ chạy kiểu Chat.",
  ]],
  ["Phân công và giám sát", [
    "Quan sát học sinh hiểu giao diện, không sao lãng.",
    "Học sinh xin đáp án ngay: nhắc lại quy tắc, khuyến khích tự nghĩ.",
  ]],
  ["Hỗ trợ và điều chỉnh", [
    "Xem Thống kê: lỗi thường gặp, bước học sinh hay kẹt, mức gợi ý. Nếu nhiều em sai ở bước lập phương trình, giảng lại bước đó.",
    "Xem hồ sơ từng học sinh ở mục Học sinh: kỹ năng cần củng cố, lỗi hay mắc và kiến thức nền còn thiếu (ghi khi em được giải hộ bước).",
    "Mở một phiên (ở Thống kê hoặc hồ sơ học sinh) rồi bấm \"AI phân tích phiên này\" để có nhận xét riêng cho phiên đó: làm tốt ở đâu, yếu ở bước nào, nên làm gì tiếp. Kết quả được lưu, bấm \"Phân tích lại\" khi cần.",
    "Thống kê, hồ sơ và danh sách Học sinh cho biết bước nào học sinh hay gặp khó (bấm Gợi ý, hỏi, làm sai hoặc được giải hộ). AI đề xuất cải thiện có thêm mục Ôn tập theo bước.",
    "Xóa liên kết hoặc xóa học sinh chỉ ẩn đi, dữ liệu vẫn được giữ. Học sinh vào lại bằng cùng mã thì hiện lại.",
    "Chỉnh gợi ý trong đề rồi tạo liên kết mới (liên kết cũ giữ bản đề cũ).",
  ]],
  ["Bảo mật và đạo đức", [
    "Học sinh không cần tài khoản. Em nhập mã và họ tên khi vào bài để thầy cô biết ai cần hỗ trợ. Hệ thống không lưu lớp hay IP, và tự che số điện thoại, email khi học sinh lỡ gõ.",
    "Thống kê hiện ngay khi có phiên đầu tiên; số liệu càng chính xác khi có nhiều học sinh.",
    "Dữ liệu bị xóa chỉ bị ẩn, không mất.",
    "Nhắc học sinh không chia sẻ thông tin cá nhân với chatbot.",
  ]],
];

export default function Page() {
  return (
    <div className="flex max-w-prose flex-col gap-6">
      <h1>Hướng dẫn giáo viên</h1>
      {BLOCKS.map(([t, items]) => (
        <section key={t} className="flex flex-col gap-2">
          <h2>{t}</h2>
          <ul className="list-disc space-y-1 pl-5">{items.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h2>Quy trình học sinh thấy</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Khám phá tình huống</li><li>Phân tích dữ kiện</li><li>Đề xuất phương án</li><li>Thực hiện giải quyết</li><li>Đánh giá kết quả</li>
        </ol>
        <p className="text-text-muted">Gợi ý tăng dần khi học sinh kẹt. Kiểu Từng bước có 3 mức riêng cho từng bước: định hướng, chỉ cách làm, nêu tên phép tính cần dùng. Kiểu Chat (khi đề thiếu lời giải từng bước) có 4 mức, mức 4 là làm mẫu bằng số khác. Hết gợi ý mà vẫn kẹt thì chatbot hiện lời giải của bước đó để em đi tiếp; bước được giải hộ không được tính điểm.</p>
      </section>
    </div>
  );
}
