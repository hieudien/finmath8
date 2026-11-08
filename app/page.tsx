import Brand from "@/components/Brand";
import { LinkButton } from "@/components/ui";

const STEPS = [
  ["Khám phá tình huống", "Em đọc đề và nói bài hỏi gì."],
  ["Phân tích dữ kiện", "Em ghi lại số liệu và đại lượng cần tìm."],
  ["Đề xuất phương án", "Em chọn cách tính: phép tính, biểu thức hay phương trình."],
  ["Thực hiện giải quyết", "Em tính từng bước, chatbot kiểm tra cùng em."],
  ["Đánh giá kết quả", "Em so sánh phương án và rút ra bài học."],
];

const CASES = ["Chọn cửa hàng mua vở tiết kiệm", "Lập kế hoạch tiết kiệm mua dụng cụ", "So sánh hai khuyến mãi mua áo", "Chọn gói cước điện thoại", "Lãi đơn và lãi kép khi gửi tiết kiệm", "Mua xe đạp trả góp", "Phân bổ ngân sách ăn trưa", "Đầu tư cổ phiếu đơn giản", "Giá tai nghe sau giảm giá và VAT", "Chia chi phí chuyến tham quan"];

export default function Home() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <Brand tagline />
        <nav className="flex gap-1" aria-label="Tài khoản">
          <LinkButton href="/login" variant="ghost">Đăng nhập</LinkButton>
          <LinkButton href="/register" variant="secondary">Đăng ký</LinkButton>
        </nav>
      </header>

      <main className="flex flex-col gap-12 py-8">
        <section className="flex flex-col gap-4">
          <h1>Chatbot giúp học sinh tự giải Toán từng bước</h1>
          <p className="max-w-prose text-lg text-text-muted">
            Chatbot không đưa đáp án. Nó hỏi từng bước theo cách giải của Polya và tăng gợi ý theo 3 mức, để học sinh tự nghĩ.
            Giáo viên nạp đề, bấm tạo liên kết, gửi cho lớp.
          </p>
          <LinkButton href="/register" className="self-start">Tạo tài khoản giáo viên</LinkButton>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="gv">
          <h2 id="gv">Giáo viên làm 3 việc</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Chọn Gemini hoặc ChatGPT, nhập API key của thầy cô (có hướng dẫn cách lấy key).</li>
            <li>Dùng 10 đề mẫu có sẵn, hoặc nạp đề dạng JSON, hoặc dán văn bản để hệ thống chuẩn hóa thành JSON.</li>
            <li>Bấm tạo liên kết công khai. Chatbot dùng được ngay, học sinh không cần tài khoản.</li>
          </ol>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="hs">
          <h2 id="hs">Học sinh được dẫn qua 5 bước</h2>
          <ol className="divide-y divide-border border-y border-border">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-3 py-3"><span className="tnum w-6 font-bold text-primary">{i + 1}</span><span><strong className="font-medium">{t}.</strong> {d}</span></li>
            ))}
          </ol>
          <p className="text-text-muted">Gợi ý mức 1: hỏi định hướng. Mức 2: gợi ý cách giải. Mức 3: nêu bước tính đầu tiên.</p>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="tk">
          <h2 id="tk">Thống kê theo từng học sinh và từng liên kết</h2>
          <p className="max-w-prose">
            Thầy cô thấy lượt dùng, điểm theo 4 tiêu chí (nhận diện, lập kế hoạch, tính toán, giải thích), mức gợi ý đã dùng và lỗi thường gặp.
            Học sinh nhập mã và họ tên khi vào bài; hệ thống không lưu lớp hay IP, và tự che số điện thoại, email nếu học sinh lỡ gõ trong tin nhắn.
          </p>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="tc">
          <h2 id="tc">10 tình huống mẫu có sẵn</h2>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {CASES.map((c, i) => <li key={c}><span className="tnum text-text-muted">TC{String(i + 1).padStart(2, "0")}</span> {c}</li>)}
          </ul>
        </section>
      </main>

      <footer className="mt-auto border-t border-border py-6 text-sm text-text-muted">
        MathStep AI: dữ liệu chỉ dùng cho nghiên cứu sư phạm.
      </footer>
    </div>
  );
}
