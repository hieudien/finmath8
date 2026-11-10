// Câu cứng của bot (không gọi AI). Mỗi tình huống có 5 biến thể cùng ý, đổi chữ, chọn ngẫu nhiên cho đỡ lặp.
// Giữ nguyên các mốc máy đọc: "Bước k/n:" (do nextLine nối vào) và "Việc cần làm ở bước k/n:" (do cueLine nối vào).

// avoid: tin bot ngay trước; bỏ biến thể đã nói trong tin đó (nếu còn biến thể khác).
export const pick = (arr: readonly string[], avoid?: string): string => {
  const ok = avoid ? arr.filter((x) => !avoid.includes(x)) : arr;
  const src = ok.length ? ok : arr;
  return src[Math.floor(Math.random() * src.length)];
};
// Tin bot gần nhất trong lịch sử (để pick tránh lặp liền kề).
export const lastBot = (all: readonly { role: string; content: string }[]) => [...all].reverse().find((m) => m.role === "bot")?.content;

export const STUCK_HINT = [
  "Bạn chưa chắc chỗ này à? Bấm Gợi ý để mình gợi ý từng chút nhé.",
  "Chỗ này còn vướng đúng không? Bạn bấm Gợi ý, mình sẽ chỉ từng chút một.",
  "Không sao, bước này cần thời gian. Bạn thử bấm Gợi ý để mình giúp từng chút nhé.",
  "Bạn chưa rõ hướng làm à? Bấm nút Gợi ý, mình đưa gợi ý nhẹ trước nhé.",
  "Cứ bình tĩnh nhé. Bạn bấm Gợi ý để có thêm manh mối cho bước này.",
] as const;

export const STUCK_NOHINT = [
  "Bạn đã dùng hết gợi ý của bước này, bạn bấm Em chưa hiểu nếu chưa rõ đề, hoặc thử viết bước của mình nhé.",
  "Bước này bạn đã dùng hết gợi ý rồi. Nếu chưa rõ đề thì bấm Em chưa hiểu, hoặc cứ thử viết bước của mình nhé.",
  "Mình đã đưa hết gợi ý cho bước này. Bạn bấm Em chưa hiểu nếu còn thắc mắc về đề, hoặc thử viết ra bước bạn nghĩ nhé.",
  "Bạn dùng hết gợi ý của bước này rồi. Chưa rõ đề thì bấm Em chưa hiểu, còn không thì thử viết bước của mình xem sao nhé.",
  "Bước này đã hết gợi ý. Bạn bấm Em chưa hiểu để hỏi về đề, hoặc thử viết bước theo cách bạn hiểu nhé.",
] as const;

export const QUIZ_NOHINT = [
  "Bạn đã dùng hết gợi ý của bước này. Bạn tự tính rồi chọn đáp án nhé.",
  "Bước này đã hết gợi ý. Bạn tự tính rồi chọn đáp án mình nghĩ là đúng nhé.",
  "Mình đã đưa hết gợi ý cho bước này rồi. Bạn tính thử rồi chọn đáp án nhé.",
  "Hết gợi ý cho bước này rồi. Bạn tự tính từng bước rồi chọn đáp án nhé.",
  "Bạn dùng hết gợi ý của bước này rồi. Hãy tự tính và chọn đáp án nhé.",
] as const;

export const ASK_ANSWER = [
  "Mình không cho đáp án được, nhưng mình sẽ giúp từng bước.",
  "Đáp án thì mình không nói trước được, nhưng mình đi cùng bạn từng bước nhé.",
  "Mình không cho đáp án sẵn đâu, bù lại mình sẽ hướng dẫn từng bước.",
  "Mình không đưa đáp án được, nhưng bạn sẽ tự tìm ra nếu đi từng bước cùng mình.",
  "Đáp án mình để bạn tự tìm nhé, mình sẽ giúp từng bước.",
] as const;

export const REPEAT = [
  "Bạn đang nộp lại đúng nội dung vừa rồi, mình vẫn chưa thấy bước này khớp. Bạn bấm Gợi ý hoặc Em chưa hiểu để mình giúp nhé.",
  "Bạn vừa nộp lại đúng nội dung cũ, bước này vẫn chưa khớp. Bạn thử bấm Gợi ý hoặc Em chưa hiểu nhé.",
  "Nội dung này bạn đã nộp rồi, mình vẫn chưa thấy khớp với bước này. Bấm Gợi ý hoặc Em chưa hiểu để mình hỗ trợ nhé.",
  "Tin này giống hệt tin trước, nên kết quả vẫn vậy. Bạn bấm Gợi ý hoặc Em chưa hiểu để đi tiếp nhé.",
  "Bạn gửi lại đúng như lần trước, mình vẫn chưa thấy khớp. Thử bấm Gợi ý hoặc Em chưa hiểu xem sao nhé.",
] as const;

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
  "Quay lại bài thôi nào, mình đang chờ bước của bạn. Bạn bấm Gợi ý nếu cần nhé.",
  "Mình vẫn đợi bạn viết bước giải. Cần giúp thì bấm Gợi ý nhé.",
  "Bài toán vẫn đang chờ bạn đó. Nếu vướng thì bạn bấm Gợi ý nhé.",
] as const;
export const isOff = (t: string) => [...OFF_FIRST, ...OFF_AGAIN].some((x) => t.startsWith(x));

export const ASK_LIMIT = [
  "Mình hết lượt hỏi cho bài này rồi. Bạn bấm Gợi ý nếu cần nhé.",
  "Lượt hỏi của bài này đã hết. Bạn bấm Gợi ý để mình giúp tiếp nhé.",
  "Bạn đã hỏi hết số lượt cho bài này rồi. Cần giúp thì bấm Gợi ý nhé.",
  "Mình hết lượt trả lời câu hỏi cho bài này rồi, bạn dùng nút Gợi ý nhé.",
  "Số lượt hỏi của bài này đã dùng hết. Bạn thử bấm Gợi ý nhé.",
] as const;

export const ASK_IS_STEP = [
  "Có vẻ bạn đã có bước giải rồi. Bạn nộp bước này ở ô nộp bước để mình kiểm tra nhé.",
  "Nghe như bạn đã có bước giải rồi đó. Bạn gửi vào ô nộp bước để mình kiểm tra nhé.",
  "Đây giống một bước giải rồi. Bạn nộp nó ở ô nộp bước, mình sẽ kiểm tra giúp bạn.",
  "Bạn có sẵn bước giải rồi à? Nộp ở ô nộp bước để mình xem nhé.",
  "Có vẻ đây là bước giải của bạn. Bạn nộp ở ô nộp bước để mình kiểm tra nhé.",
] as const;

export const ASK_NOT_JUDGE = [
  "Ở đây mình chỉ giải thích đề. Bạn nộp bước của mình ở ô nộp bước để mình kiểm tra nhé.",
  "Phần này mình chỉ giải thích đề thôi. Muốn mình kiểm tra thì bạn nộp bước ở ô nộp bước nhé.",
  "Mình chỉ giải thích đề ở đây. Bạn nộp bước giải vào ô nộp bước, mình sẽ kiểm tra nhé.",
  "Mình chỉ làm rõ đề ở chỗ này thôi. Bước giải bạn nộp ở ô nộp bước để mình kiểm tra nhé.",
  "Ở mục hỏi này mình chỉ giải thích đề. Cần kiểm tra bước thì bạn nộp ở ô nộp bước nhé.",
] as const;

export const ASK_LEAK = [
  "Mình chưa giải thích được câu này mà không nói ra kết quả. Bạn thử bấm Gợi ý, hoặc viết bước đầu tiên bạn nghĩ tới nhé.",
  "Câu này mình chưa giải thích được mà không tiết lộ kết quả. Bạn bấm Gợi ý, hoặc thử viết bước đầu bạn nghĩ ra nhé.",
  "Nếu giải thích câu này thì mình sẽ lộ kết quả mất. Bạn bấm Gợi ý hoặc viết thử bước đầu tiên nhé.",
  "Mình khó giải thích câu này mà không nói ra kết quả. Bạn thử Gợi ý, hoặc viết bước đầu tiên bạn nghĩ tới nhé.",
  "Câu này mình chưa trả lời được vì sẽ lộ kết quả. Bạn bấm Gợi ý, hoặc cứ viết thử bước đầu tiên nhé.",
] as const;

export const STEP_LEAK = [
  "Mình chưa thấy bước này khớp. Bạn kiểm tra lại phép tính nhé.",
  "Bước này mình thấy chưa khớp. Bạn soát lại phép tính giúp mình nhé.",
  "Có vẻ bước này chưa khớp. Bạn tính lại một lượt xem sao nhé.",
  "Mình chưa thấy bước này đúng. Bạn kiểm tra lại phép tính nhé.",
  "Bước này chưa khớp lắm. Bạn thử rà lại phép tính nhé.",
] as const;

export const RETRY = [
  "Bạn thử lại nhé.",
  "Bạn thử làm lại xem sao nhé.",
  "Thử lại một lần nữa nhé.",
  "Bạn xem lại rồi thử lại nhé.",
  "Bạn thử viết lại bước này nhé.",
] as const;

export const capped = (done: number, n: number) => pick([
  `Mình dừng bài ở đây nhé, bài này khá dài. Bạn đã xong ${done}/${n} bước.`,
  `Mình xin dừng bài tại đây, bài này khá dài. Bạn đã hoàn thành ${done}/${n} bước.`,
  `Bài này dài rồi nên mình dừng ở đây nhé. Bạn đã làm xong ${done}/${n} bước.`,
  `Đến đây mình dừng bài nhé, bài khá dài rồi. Bạn đã xong ${done}/${n} bước.`,
  `Mình dừng bài ở đây nha, bài này khá dài. Bạn xong được ${done}/${n} bước.`,
]);

// k = số thứ tự bước (từ 1), t = lời giải của bước đó.
export const reveal = (k: number, n: number, t: string) => pick([
  `Bước này khó với bạn lúc này, mình đưa lời giải bước ${k}/${n} để bạn đi tiếp nhé: ${t}`,
  `Bước này hơi khó nên mình đưa lời giải bước ${k}/${n} để bạn đi tiếp nhé: ${t}`,
  `Mình cho bạn xem lời giải bước ${k}/${n} để đi tiếp nhé, bước này đang khó với bạn: ${t}`,
  `Để bạn không bị kẹt, mình đưa lời giải bước ${k}/${n} nhé: ${t}`,
  `Bước này đang làm khó bạn, mình đưa lời giải bước ${k}/${n} để mình cùng đi tiếp: ${t}`,
]);

export const CLOSINGS = [
  "Bạn đã tự giải xong bài này, cách làm của bạn hợp lý. Làm tốt lắm!",
  "Bạn tự giải xong cả bài rồi, cách làm rất hợp lý. Giỏi lắm!",
  "Xong bài rồi! Bạn tự làm hết và cách làm hợp lý. Làm tốt lắm!",
  "Bạn đã hoàn thành bài này bằng chính cách làm của mình, rất hợp lý. Tuyệt vời!",
  "Bài này bạn tự giải xong rồi, các bước hợp lý. Làm tốt lắm nhé!",
] as const;
export const CLOSINGS_HELP = [
  "Bài đã xong, nhưng mình đã giúp ở một số bước. Bạn xem lại lời giải rồi làm thử một bài tương tự nhé.",
  "Bài xong rồi, tuy mình có giúp ở vài bước. Bạn xem lại lời giải rồi thử một bài tương tự nhé.",
  "Bạn đã đi hết bài, dù có vài bước mình đưa lời giải. Hãy xem lại rồi làm thử một bài tương tự nhé.",
  "Bài đã hoàn thành, nhưng có một số bước mình đã giúp. Bạn đọc lại lời giải rồi thử bài tương tự nhé.",
  "Xong bài rồi, trong đó mình hỗ trợ ở vài bước. Bạn xem lại lời giải rồi làm thử một bài tương tự nhé.",
] as const;
export const closing = () => pick(CLOSINGS);
export const closingHelp = () => pick(CLOSINGS_HELP);
