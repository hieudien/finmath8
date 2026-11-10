import Brand from "@/components/Brand";
import { LinkButton } from "@/components/ui";

const NUMS = [["3", "mức gợi ý riêng cho từng bước"], ["4", "tiêu chí chấm: nhận diện, kế hoạch, tính toán, giải thích"], ["5", "bước giải quyết vấn đề theo Polya"]];

const TEACHER = [
  ["Tạo đề nhanh", "Soạn đề trực tiếp, dán văn bản, nạp JSON hoặc chụp ảnh đề để AI đọc. Công thức soạn bằng bàn phím toán, không cần biết LaTeX."],
  ["AI làm phần nặng", "AI tạo đáp án, lời giải từng bước, gợi ý từng bước và câu chào. Đề do AI tạo phải được thầy cô duyệt mới đưa vào liên kết."],
  ["Làm bài từng bước", "Học sinh nộp một bước giải mỗi lần; kẹt thì có 3 mức gợi ý riêng cho từng bước, lấy từ đề."],
  ["Gửi một liên kết", "Chọn đề, tạo liên kết công khai, đặt nhãn nhóm và giới hạn số tin. Chạy bằng API key Gemini hoặc OpenAI của chính thầy cô."],
];

const STUDENT = [
  ["Vào bằng liên kết", "Nhập mã và họ tên một lần, không cần tài khoản."],
  ["Được hỏi từng bước", "Đọc đề, nêu dữ kiện, chọn cách giải, tự tính. Bot không nói đáp án."],
  ["Gợi ý khi kẹt", "Gợi ý tăng dần: định hướng, chỉ cách giải, nêu bước kế. Kẹt quá lâu thì bot hiện lời giải của bước đó để em đi tiếp."],
  ["Nộp từng bước hoặc chọn đáp án", "Mỗi lần một bước vào ô ngắn, hoặc chọn 1 trong 4 đáp án. Chọn sai thì được giải thích lỗi."],
  ["Gõ công thức dễ dàng", "Nút Công thức mở bàn phím toán: phân số, căn, số mũ."],
];

const FEATURES = [
  ["Hồ sơ từng học sinh", "Điểm 4 tiêu chí, kỹ năng cần củng cố, lỗi hay mắc, kiến thức nền còn thiếu, các bài đã làm và bài bỏ dở."],
  ["Chấm đúng phần tự làm", "Bước được giải hộ không được tính điểm. Điểm chỉ phản ánh phần học sinh tự làm."],
  ["AI đề xuất cải thiện", "Một bấm để có nhận định điểm yếu, việc nên làm và dạng bài nên luyện thêm."],
  ["Bước học sinh hay gặp khó", "Thấy ngay bước nào cả lớp hay vướng và bước nào từng em hay vướng, kèm gợi ý ôn tập theo bước."],
  ["Thống kê theo liên kết", "Số phiên, tỉ lệ hoàn thành, điểm trung bình, mức gợi ý, so sánh giữa các nhóm."],
  ["Xóa an toàn", "Xóa liên kết hay học sinh chỉ là ẩn đi. Bài làm, tin nhắn và điểm vẫn được giữ."],
  ["Xem lại hội thoại", "Đọc từng phiên chat, xuất CSV để phân tích tiếp."],
  ["Chống lộ đáp án", "Server kiểm tra từng lượt: bot không nêu kết quả, không xác nhận đáp án sai."],
  ["Riêng tư có kiểm soát", "Tự che số điện thoại, email trong tin nhắn. API key mã hóa AES-256-GCM."],
];

function Chat() {
  const bubble = "max-w-[85%] rounded-lg px-3 py-2 text-sm";
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-2" aria-hidden="true">
      <p className="mb-3 text-xs font-medium text-text-muted">Giải phương trình 2x + 3 = 11</p>
      <div className="flex flex-col gap-2">
        <p className={`${bubble} self-start bg-primary-soft`}>Chào bạn! Đề yêu cầu tìm gì nhé?</p>
        <p className={`${bubble} self-end bg-primary text-on-primary`}>Tìm x, nhưng mình chưa biết bắt đầu</p>
        <p className={`${bubble} self-start bg-primary-soft`}>Thử chuyển số hạng tự do sang vế phải. Bạn viết phương trình mới thế nào?</p>
        <p className={`${bubble} self-end bg-primary text-on-primary`}>2x = 11 − 3</p>
        <p className={`${bubble} self-start bg-primary-soft`}>Chuẩn rồi! Tiếp theo bạn tính 2x bằng bao nhiêu?</p>
      </div>
    </div>
  );
}

const card = "rounded-lg border border-border bg-surface p-5 shadow-1";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <Brand tagline />
        <nav className="flex gap-1" aria-label="Tài khoản">
          <LinkButton href="/login" variant="ghost">Đăng nhập</LinkButton>
          <LinkButton href="/register" variant="secondary">Đăng ký</LinkButton>
        </nav>
      </header>

      <main className="flex flex-col gap-16 py-6">
        <section className="grid items-center gap-8 rounded-lg bg-primary-soft p-6 md:grid-cols-2 md:p-10">
          <div className="flex flex-col gap-4">
            <h1>Học sinh tự giải Toán, từng bước một</h1>
            <p className="text-lg text-text-muted">
              MathStep AI không đưa đáp án. Chatbot hỏi từng bước theo cách giải của Polya và tăng gợi ý khi học sinh kẹt. Thầy cô theo dõi điểm mạnh, điểm yếu của từng em.
            </p>
            <div className="flex flex-wrap gap-2">
              <LinkButton href="/register">Tạo tài khoản giáo viên</LinkButton>
              <LinkButton href="/login" variant="secondary">Đăng nhập</LinkButton>
            </div>
            <p className="text-sm text-text-muted">Cho mọi lớp và mọi dạng đề: giải phương trình, hình học, tỉ lệ, bài toán thực tế.</p>
          </div>
          <Chat />
        </section>

        <section aria-label="Con số chính">
          <ul className="grid gap-3 sm:grid-cols-3">
            {NUMS.map(([n, t]) => (
              <li key={n} className={`${card} flex items-center gap-4`}>
                <span className="tnum text-4xl font-bold text-primary">{n}</span>
                <span className="text-text-muted">{t}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-8 md:grid-cols-2" aria-labelledby="gv">
          <div className="flex flex-col gap-3">
            <h2 id="gv">Thầy cô làm gì</h2>
            <ol className="flex flex-col gap-3">
              {TEACHER.map(([t, d], i) => (
                <li key={t} className={`${card} flex gap-3`}>
                  <span aria-hidden="true" className="tnum grid size-8 shrink-0 place-items-center rounded-full bg-primary font-bold text-on-primary">{i + 1}</span>
                  <span><strong className="block font-medium">{t}</strong><span className="text-text-muted">{d}</span></span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-3" id="hs">
            <h2>Học sinh trải nghiệm gì</h2>
            <ol className="flex flex-col gap-3">
              {STUDENT.map(([t, d], i) => (
                <li key={t} className={`${card} flex gap-3`}>
                  <span aria-hidden="true" className="tnum grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft font-bold text-primary">{i + 1}</span>
                  <span><strong className="block font-medium">{t}</strong><span className="text-text-muted">{d}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="tk">
          <h2 id="tk">Theo dõi học sinh và lớp học</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([t, d]) => (
              <li key={t} className={`${card} transition-shadow hover:shadow-2`}>
                <h3 className="mb-1 text-base font-bold">{t}</h3>
                <p className="text-text-muted">{d}</p>
              </li>
            ))}
          </ul>
          <p className="max-w-prose text-sm text-text-muted">
            Học sinh nhập mã và họ tên khi vào bài để thầy cô biết ai cần hỗ trợ. Hệ thống không lưu lớp hay IP.
          </p>
        </section>

        <section className="flex flex-col items-start gap-3 rounded-lg bg-primary p-6 text-on-primary md:p-10" aria-labelledby="cta">
          <h2 id="cta" className="text-on-primary">Thử với một đề trong vài phút</h2>
          <p className="max-w-prose">Đăng ký, nhập API key, dùng ngay đề mẫu tài chính có sẵn hoặc tạo đề của riêng thầy cô, rồi gửi liên kết cho lớp.</p>
          <LinkButton href="/register" variant="secondary">Bắt đầu ngay</LinkButton>
        </section>
      </main>

      <footer className="mt-auto border-t border-border py-6 text-sm text-text-muted">
        MathStep AI: dữ liệu chỉ dùng cho nghiên cứu sư phạm.
      </footer>
    </div>
  );
}
