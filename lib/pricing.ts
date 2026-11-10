// Ước tính tiền AI từ số token. Bảng giá chỉ là số ước tính, giáo viên chỉnh lại ở Cài đặt theo bảng giá thật của nhà cung cấp.
export type Price = { in: number; cached: number; out: number }; // USD cho 1 triệu token
export type UsageRow = { provider: string; model: string; use: string; calls: number; input: number; cached: number; output: number; thoughts: number };

// Khoảng thời gian thống kê (trượt tính từ lúc xem): khóa trong URL ?range=, số ngày, nhãn nút, nhãn khoảng.
export const RANGES = { day: [1, "Ngày", "24 giờ"], week: [7, "Tuần", "7 ngày"], month: [30, "Tháng", "30 ngày"] } as const;
export type Range = keyof typeof RANGES;
export const toRange = (v: unknown): Range => (typeof v === "string" && Object.hasOwn(RANGES, v) ? (v as Range) : "month");

export const USD_VND = 26000;
const FLASH_LITE: Price = { in: 0.1, cached: 0.025, out: 0.4 };
const FLASH: Price = { in: 0.3, cached: 0.075, out: 2.5 };
export const FALLBACK_PRICE: Price = FLASH;
export const DEFAULT_PRICES: Record<string, Price> = {
  "gemini-3.5-flash-lite": FLASH_LITE,
  "gemini-3.1-flash-lite": FLASH_LITE,
  "gemini-3.5-flash": FLASH,
  "gemini-3.8-flash": FLASH,
  "gpt-6-luna": { in: 0.15, cached: 0.075, out: 0.6 },
  "gpt-6.1-terra": { in: 1.25, cached: 0.125, out: 10 },
  "gpt-6.1-sol": { in: 2.5, cached: 0.25, out: 10 },
  "gpt-6-astra": { in: 1.25, cached: 0.125, out: 10 },
};

// input đã gồm phần cache (cả Gemini và OpenAI). Gemini tính token suy nghĩ ngoài output nhưng vẫn trả theo giá output; OpenAI đã gộp vào output.
export const outBilled = (r: Pick<UsageRow, "provider" | "output" | "thoughts">) => r.output + (r.provider === "gemini" ? r.thoughts : 0);
export const costUsd = (r: UsageRow, p: Price) => ((r.input - r.cached) * p.in + r.cached * p.cached + outBilled(r) * p.out) / 1e6;

// Nhãn "dùng làm gì" (khớp opts.use của askJson) và nhóm hiển thị.
export const STUDENT = "Học sinh làm bài", TEACHER = "Giáo viên tạo và phân tích", OTHER = "Chưa rõ";
export const USES: Record<string, [string, string]> = {
  chat: ["Chat với học sinh", STUDENT],
  step: ["Nhận xét bước giải", STUDENT],
  ask: ["Trả lời “Em chưa hiểu”", STUDENT],
  eval: ["Chấm điểm phiên", STUDENT],
  solution_steps: ["Viết lời giải từng bước", TEACHER],
  answer: ["Tính đáp án", TEACHER],
  step_guides: ["Viết chỉ dẫn và gợi ý từng bước", TEACHER],
  greeting: ["Viết lời chào", TEACHER],
  cross_check: ["Kiểm chéo đáp án", TEACHER],
  normalize: ["Chuẩn hóa và tạo đề", TEACHER],
  read_image: ["Đọc ảnh đề", TEACHER],
  selftest: ["Kiểm thử chatbot", TEACHER],
  analyze_session: ["Phân tích phiên", TEACHER],
  advise: ["Phân tích học sinh", TEACHER],
};

// Nhóm `use` cho các số trung bình ở Cài đặt: nạp 1 đề, HS chat 1 phiên, phân tích kết quả HS.
export const AVG_USES = {
  problem: ["normalize", "read_image", "solution_steps", "answer", "step_guides", "greeting", "cross_check"],
  session: ["chat", "step", "ask", "eval"],
  analysis: ["analyze_session", "advise"],
} as const;

// Cộng calls, token và tiền (đã quy đổi bởi money) của các dòng thuộc tập `use`.
export function sumUses(rows: UsageRow[], uses: readonly string[], money: (r: UsageRow) => number) {
  const t = { calls: 0, tokens: 0, vnd: 0 };
  for (const r of rows) if (uses.includes(r.use)) { t.calls += r.calls; t.tokens += r.input + outBilled(r); t.vnd += money(r); }
  return t;
}
export const purposeInfo =(u: string): [string, string] => USES[u] ?? ["Chưa rõ (dữ liệu cũ)", OTHER];
