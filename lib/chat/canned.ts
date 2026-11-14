// Câu cứng của bot (không gọi AI): lạc đề, hết gợi ý, câu bị cắt vì sắp lộ đáp án. Mỗi tình huống có vài biến thể cùng ý, chọn ngẫu nhiên cho đỡ lặp.

// avoid: tin bot ngay trước; bỏ biến thể đã nói trong tin đó (nếu còn biến thể khác).
export const pick = (arr: readonly string[], avoid?: string): string => {
  const ok = avoid ? arr.filter((x) => !avoid.includes(x)) : arr;
  const src = ok.length ? ok : arr;
  return src[Math.floor(Math.random() * src.length)];
};
// Tin bot gần nhất trong lịch sử (để pick tránh lặp liền kề).
export const lastBot = (all: readonly { role: string; content: string }[]) => [...all].reverse().find((m) => m.role === "bot")?.content;

// Lạc đề/injection: lần đầu và lần liên tiếp thứ 2 trở đi dùng hai nhóm khác nhau (offReply nhận ra lần trước qua tiền tố).
export const OFF_FIRST = [
  "Mình chỉ hỗ trợ bài toán này thôi nhé.",
  "Mình chỉ giúp được bài toán đang làm thôi nhé.",
  "Chuyện này nằm ngoài bài toán rồi, mình chỉ hỗ trợ bài này thôi nhé.",
  "Mình chỉ làm việc với bài toán này thôi nha.",
  "Ở đây mình chỉ hỗ trợ bài toán trước mắt thôi nhé.",
] as const;
export const OFF_AGAIN = [
  "Mình vẫn chờ bạn làm bài. Bạn bấm Gợi ý nếu cần nhé.",
  "Mình vẫn ở đây chờ bạn làm bài. Cần thì bạn bấm Gợi ý nhé.",
  "Quay lại bài thôi nào, mình đang chờ bài làm của bạn. Bạn bấm Gợi ý nếu cần nhé.",
  "Mình vẫn đợi bạn viết lời giải. Cần giúp thì bấm Gợi ý nhé.",
  "Bài toán vẫn đang chờ bạn đó. Nếu vướng thì bạn bấm Gợi ý nhé.",
] as const;
export const isOff = (t: string) => [...OFF_FIRST, ...OFF_AGAIN].some((x) => t.startsWith(x));

// Bấm Gợi ý khi đã dùng hết các mức.
export const HINT_END = [
  "Bạn đã dùng hết gợi ý, bạn bấm Em chưa hiểu nếu chưa rõ đề, hoặc thử viết phần bạn nghĩ ra nhé.",
  "Bạn đã dùng hết gợi ý rồi. Nếu chưa rõ đề thì bấm Em chưa hiểu, hoặc cứ thử viết ra phần bạn làm được nhé.",
  "Mình đã đưa hết gợi ý. Bạn bấm Em chưa hiểu nếu còn thắc mắc về đề, hoặc thử viết ra điều bạn nghĩ nhé.",
] as const;

// Câu AI đang viết sắp nêu kết quả mà học sinh chưa tự tìm ra: cắt luồng và nối câu này.
export const LEAK_CUT = [
  "Mình dừng ở đây để không nói trước kết quả. Bạn thử viết tiếp phần bạn nghĩ ra nhé.",
  "Phần còn lại mình để bạn tự làm nhé. Bạn thử viết tiếp xem sao.",
  "Mình không nói trước kết quả được. Bạn thử làm tiếp rồi nộp, mình sẽ nhận xét nhé.",
] as const;
