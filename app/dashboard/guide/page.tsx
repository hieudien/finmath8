const BLOCKS: [string, string[]][] = [
  ["Chuẩn bị bài học", [
    "Chọn 2–3 tình huống phù hợp nội dung sắp dạy, nạp vào mục Đề bài.",
    "Giới thiệu chatbot: \"Chatbot gợi ý từng bước, em cố gắng trả lời trước khi xin gợi ý\".",
    "Mỗi học sinh tự chat riêng trên thiết bị của mình.",
  ]],
  ["Phân công và giám sát", [
    "Quan sát học sinh hiểu giao diện, không sao lãng.",
    "Học sinh xin đáp án ngay: nhắc lại quy tắc, khuyến khích tự nghĩ.",
  ]],
  ["Tổ chức thực nghiệm", [
    "Dùng 4–6 tuần, kèm lớp đối chứng không dùng chatbot.",
    "Tạo liên kết gắn nhóm Trước/Sau hoặc Thực nghiệm/Đối chứng để so sánh ở Thống kê.",
    "Bài kiểm tra trước và sau không cho dùng chatbot.",
  ]],
  ["Hỗ trợ và điều chỉnh", [
    "Xem Thống kê: lỗi thường gặp, bước học sinh hay kẹt, mức gợi ý. Nếu nhiều em sai ở bước lập phương trình, giảng lại bước đó.",
    "Chỉnh gợi ý trong đề rồi tạo liên kết mới (liên kết cũ giữ bản đề cũ).",
  ]],
  ["Bảo mật và đạo đức", [
    "Học sinh không đăng nhập, không nhập tên. Hệ thống không lưu IP hay tên, và tự che số điện thoại, email, tên khi học sinh lỡ gõ.",
    "Thống kê chỉ hiện chi tiết khi có từ 3 phiên trở lên.",
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
        <p className="text-text-muted">Gợi ý 3 mức: mức 1 hỏi định hướng, mức 2 gợi ý cách giải, mức 3 nêu bước tính đầu. Chatbot luôn bắt đầu ở mức 1.</p>
      </section>
    </div>
  );
}
