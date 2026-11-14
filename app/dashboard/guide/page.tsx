const BLOCKS: [string, string[]][] = [
  ["Chuẩn bị bài học", [
    "Vào Cài đặt, nhập API key Google Gemini (mục đó có hướng dẫn lấy key). Chưa có key thì AI và chatbot chưa chạy được.",
    "Chọn 2–3 đề phù hợp nội dung sắp dạy: nhập trực tiếp, chụp ảnh đề hoặc nạp tệp Word ở mục Đề bài.",
    "Giới thiệu chatbot: \"Chatbot nhận xét bài làm và gợi ý, em cố gắng tự làm trước khi xin gợi ý\".",
    "Mỗi học sinh tự làm riêng trên thiết bị của mình.",
  ]],
  ["Cách học sinh làm bài", [
    "Học sinh viết bài làm vào một ô: một bước, nhiều bước hoặc cả bài đều được, không có yêu cầu hay gợi ý theo bước nào. Có nút Gợi ý và nút Em chưa hiểu. Bấm Em chưa hiểu sẽ mở khung Hỏi bài riêng (viền vàng), tách khỏi ô bài làm, để hỏi khi chưa rõ đề hoặc cách bắt đầu.",
    "Nếu học sinh làm dở rồi mở lại liên kết, em chọn Làm tiếp hoặc Làm lại mới.",
  ]],
  ["Chuẩn bị đề", [
    "Đề cần có lời giải chi tiết, nếu thiếu thì học sinh chưa làm được (bổ sung rồi tạo liên kết mới). Nếu chưa có, bấm \"Chuẩn hóa đề\" ở trang đề.",
    "Bấm \"Chuẩn hóa đề\" (ở trang từng đề, hoặc nút Chuẩn hóa N đề ở danh sách đề) để AI sửa công thức hỏng và viết lại lời giải chi tiết từng bước cơ bản nhất. Lời giải này là nguồn duy nhất để chatbot nhận xét và gợi ý, học sinh không thấy. Đề đã chuẩn hóa kiểu cũ nên chuẩn hóa lại.",
    "Đề hình học có hình vẽ: sau khi đọc ảnh, kiểm tra hình AI cắt và dòng mô tả hình (chatbot chỉ đọc phần mô tả, nên ghi đủ dữ kiện như độ dài, góc vuông). Có thể khoanh lại hình nếu cắt lệch.",
    "Mỗi đề được phân loại Đại số hoặc Hình học, kèm lớp và chủ đề; dùng bộ lọc ở danh sách đề để tìm nhanh.",
    "Đọc lại lời giải và đáp án AI viết. Khi sửa đề, tick xác nhận đáp án đúng thì đáp án được khóa; bấm Mở khóa nếu cần sửa lại.",
    "Nhiều đề cùng lúc: trong Cài đặt, \"Xác nhận đáp án hàng loạt\" cho tự giải rồi tick các đề đúng để khóa. \"Kiểm tra đề\" nhờ AI giải lại và rà phép tính (đề có vấn đề được gắn \"Cần xem lại\" ở trang Đề bài). \"Chuẩn hóa tất cả đề\" làm lại mọi đề một lần.",
  ]],
  ["Phân công và giám sát", [
    "Quan sát học sinh hiểu giao diện, không sao lãng.",
    "Học sinh xin đáp án ngay: nhắc lại quy tắc, khuyến khích tự nghĩ.",
  ]],
  ["Hỗ trợ và điều chỉnh", [
    "Xem Thống kê: lỗi thường gặp, bước học sinh hay kẹt, mức gợi ý. Nếu nhiều em sai ở bước lập phương trình, giảng lại bước đó.",
    "Xem hồ sơ từng học sinh ở mục Học sinh: điểm 4 tiêu chí (thang 10), kỹ năng cần củng cố và lỗi hay mắc.",
    "Thống kê có thể xem theo liên kết, theo đề (đề nào em nào làm được) và theo học sinh.",
    "Muốn phụ huynh xem kết quả: mở hồ sơ học sinh, bấm nút chia sẻ để tạo liên kết riêng. Ai có liên kết đều xem được, nên chỉ gửi cho phụ huynh; có thể thu hồi bất cứ lúc nào.",
    "Mở một phiên (ở Thống kê hoặc hồ sơ học sinh) rồi bấm \"AI phân tích phiên này\" để có nhận xét riêng cho phiên đó: làm tốt ở đâu, yếu ở bước nào, nên làm gì tiếp. Kết quả được lưu, bấm \"Phân tích lại\" khi cần.",
    "Thống kê, hồ sơ và danh sách Học sinh cho biết bước nào học sinh hay gặp khó (bấm Gợi ý, hỏi hoặc làm sai). AI đề xuất cải thiện có thêm mục Ôn tập theo bước.",
    "Cài đặt có Nhật ký lỗi để xem lúc nào học sinh gặp lỗi.",
    "Xóa liên kết hoặc xóa học sinh chỉ ẩn đi, dữ liệu vẫn được giữ. Học sinh vào lại bằng cùng họ tên và lớp thì hiện lại.",
    "Chỉnh lời giải hoặc gợi ý chung trong đề rồi tạo liên kết mới (liên kết cũ giữ bản đề cũ).",
  ]],
  ["Bảo mật và đạo đức", [
    "Học sinh không cần tài khoản. Mỗi khi mở liên kết, em nhập họ tên và lớp để thầy cô biết ai cần hỗ trợ. Hệ thống không lưu IP, và tự che số điện thoại, email khi học sinh lỡ gõ.",
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
        <h2>Chatbot nhận xét thế nào</h2>
        <p className="text-text-muted">Học sinh có thể nộp một bước, nhiều bước hoặc cả lời giải một lần; chatbot nhận xét đúng phần vừa nộp theo cách giải quyết vấn đề của Polya. Bấm Gợi ý có 3 mức tăng dần: nêu hướng, nêu cách làm bằng lời, câu hỏi nhỏ, bám vào phần em đã làm. Gợi ý và nhận xét chỉ dựa trên đề đã chuẩn hóa, không lấy nguồn ngoài, và chatbot không nêu đáp án.</p>
      </section>
    </div>
  );
}
