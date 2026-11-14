// Câu cứng của bot (không gọi AI). Mỗi tình huống có 5 biến thể cùng ý, đổi chữ, chọn ngẫu nhiên cho đỡ lặp.
// Không câu nào nêu số thứ tự bước hay việc phải làm ở bước nào: học sinh làm một bước, nhiều bước hoặc cả bài tùy ý.

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
  "Không sao, chỗ này cần thời gian. Bạn thử bấm Gợi ý để mình giúp từng chút nhé.",
  "Bạn chưa rõ hướng làm à? Bấm nút Gợi ý, mình đưa gợi ý nhẹ trước nhé.",
  "Cứ bình tĩnh nhé. Bạn bấm Gợi ý để có thêm manh mối.",
] as const;

export const STUCK_NOHINT = [
  "Bạn đã dùng hết gợi ý, bạn bấm Em chưa hiểu nếu chưa rõ đề, hoặc thử viết phần bạn nghĩ ra nhé.",
  "Bạn đã dùng hết gợi ý rồi. Nếu chưa rõ đề thì bấm Em chưa hiểu, hoặc cứ thử viết ra phần bạn làm được nhé.",
  "Mình đã đưa hết gợi ý. Bạn bấm Em chưa hiểu nếu còn thắc mắc về đề, hoặc thử viết ra điều bạn nghĩ nhé.",
  "Bạn dùng hết gợi ý rồi. Chưa rõ đề thì bấm Em chưa hiểu, còn không thì thử viết ra theo cách bạn hiểu xem sao nhé.",
  "Đã hết gợi ý. Bạn bấm Em chưa hiểu để hỏi về đề, hoặc thử viết ra theo cách bạn hiểu nhé.",
] as const;

export const ASK_ANSWER = [
  "Mình không cho đáp án được, nhưng mình sẽ giúp bạn tự tìm ra.",
  "Đáp án thì mình không nói trước được, nhưng mình đi cùng bạn nhé.",
  "Mình không cho đáp án sẵn đâu, bù lại mình sẽ gợi ý cho bạn.",
  "Mình không đưa đáp án được, nhưng bạn sẽ tự tìm ra nếu cùng mình làm từng chút.",
  "Đáp án mình để bạn tự tìm nhé, mình sẽ giúp bạn.",
] as const;

export const REPEAT = [
  "Bạn đang nộp lại đúng nội dung vừa rồi, mình vẫn chưa thấy khớp. Bạn bấm Gợi ý hoặc Em chưa hiểu để mình giúp nhé.",
  "Bạn vừa nộp lại đúng nội dung cũ, vẫn chưa khớp. Bạn thử bấm Gợi ý hoặc Em chưa hiểu nhé.",
  "Nội dung này bạn đã nộp rồi, mình vẫn chưa thấy khớp. Bấm Gợi ý hoặc Em chưa hiểu để mình hỗ trợ nhé.",
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
  "Quay lại bài thôi nào, mình đang chờ bài làm của bạn. Bạn bấm Gợi ý nếu cần nhé.",
  "Mình vẫn đợi bạn viết lời giải. Cần giúp thì bấm Gợi ý nhé.",
  "Bài toán vẫn đang chờ bạn đó. Nếu vướng thì bạn bấm Gợi ý nhé.",
] as const;
export const isOff = (t: string) => [...OFF_FIRST, ...OFF_AGAIN].some((x) => t.startsWith(x));

export const ASK_IS_STEP = [
  "Có vẻ bạn đã có bài làm rồi. Bạn nộp ở ô bài làm để mình kiểm tra nhé.",
  "Nghe như bạn đã có lời giải rồi đó. Bạn gửi vào ô bài làm để mình kiểm tra nhé.",
  "Đây giống một phần lời giải rồi. Bạn nộp nó ở ô bài làm, mình sẽ kiểm tra giúp bạn.",
  "Bạn có sẵn lời giải rồi à? Nộp ở ô bài làm để mình xem nhé.",
  "Có vẻ đây là bài làm của bạn. Bạn nộp ở ô bài làm để mình kiểm tra nhé.",
] as const;

export const ASK_NOT_JUDGE = [
  "Ở đây mình chỉ giải thích đề. Bạn nộp bài làm ở ô bài làm để mình kiểm tra nhé.",
  "Phần này mình chỉ giải thích đề thôi. Muốn mình kiểm tra thì bạn nộp bài làm ở ô bài làm nhé.",
  "Mình chỉ giải thích đề ở đây. Bạn nộp lời giải vào ô bài làm, mình sẽ kiểm tra nhé.",
  "Mình chỉ làm rõ đề ở chỗ này thôi. Lời giải bạn nộp ở ô bài làm để mình kiểm tra nhé.",
  "Ở mục hỏi này mình chỉ giải thích đề. Cần kiểm tra bài làm thì bạn nộp ở ô bài làm nhé.",
] as const;

export const ASK_LEAK = [
  "Mình chưa giải thích được câu này mà không nói ra kết quả. Bạn thử bấm Gợi ý, hoặc viết ra điều đầu tiên bạn nghĩ tới nhé.",
  "Câu này mình chưa giải thích được mà không tiết lộ kết quả. Bạn bấm Gợi ý, hoặc thử viết ra điều bạn nghĩ nhé.",
  "Nếu giải thích câu này thì mình sẽ lộ kết quả mất. Bạn bấm Gợi ý hoặc viết thử phần bạn làm được nhé.",
  "Mình khó giải thích câu này mà không nói ra kết quả. Bạn thử Gợi ý, hoặc viết ra điều đầu tiên bạn nghĩ tới nhé.",
  "Câu này mình chưa trả lời được vì sẽ lộ kết quả. Bạn bấm Gợi ý, hoặc cứ viết thử phần bạn làm được nhé.",
] as const;

export const STEP_LEAK = [
  "Mình chưa thấy phần này khớp. Bạn kiểm tra lại phép tính nhé.",
  "Phần này mình thấy chưa khớp. Bạn soát lại phép tính giúp mình nhé.",
  "Có vẻ phần này chưa khớp. Bạn tính lại một lượt xem sao nhé.",
  "Mình chưa thấy phần này đúng. Bạn kiểm tra lại phép tính nhé.",
  "Phần này chưa khớp lắm. Bạn thử rà lại phép tính nhé.",
] as const;

// Học sinh làm cách khác lời giải mẫu, các dòng vừa viết đều đúng nhưng bài chưa xong: khẳng định đúng hướng.
export const ALT_OK = [
  "Các dòng bạn vừa viết đều đúng và đang đi đúng hướng. Bạn viết tiếp nhé.",
  "Cách làm của bạn đúng hướng, mình chưa thấy chỗ sai nào. Bạn viết tiếp nhé.",
  "Phần bạn viết là đúng, cách làm này hợp lý. Bạn tiếp tục nhé.",
  "Mình thấy phần bạn viết đúng. Bạn cứ đi tiếp theo cách của mình nhé.",
  "Đoạn này bạn làm đúng và đi đúng hướng. Bạn viết tiếp để hoàn thành bài nhé.",
] as const;

export const RETRY = [
  "Bạn thử lại nhé.",
  "Bạn thử làm lại xem sao nhé.",
  "Thử lại một lần nữa nhé.",
  "Bạn xem lại rồi thử lại nhé.",
  "Bạn thử viết lại phần này nhé.",
] as const;

// Bot hiện lời giải của phần học sinh đang kẹt (t = lời giải chuẩn của phần đó). Không nêu số thứ tự bước.
export const reveal = (t: string) => pick([
  `Phần này khó với bạn lúc này, mình đưa lời giải để bạn đi tiếp nhé: ${t}`,
  `Chỗ này hơi khó nên mình đưa lời giải để bạn đi tiếp nhé: ${t}`,
  `Mình cho bạn xem lời giải của phần này để đi tiếp nhé, chỗ này đang khó với bạn: ${t}`,
  `Để bạn không bị kẹt, mình đưa lời giải của phần này nhé: ${t}`,
  `Phần này đang làm khó bạn, mình đưa lời giải để mình cùng đi tiếp: ${t}`,
]);

export const CLOSINGS = [
  "Bạn đã tự giải xong bài này, cách làm của bạn hợp lý. Làm tốt lắm!",
  "Bạn tự giải xong cả bài rồi, cách làm rất hợp lý. Giỏi lắm!",
  "Xong bài rồi! Bạn tự làm hết và cách làm hợp lý. Làm tốt lắm!",
  "Bạn đã hoàn thành bài này bằng chính cách làm của mình, rất hợp lý. Tuyệt vời!",
  "Bài này bạn tự giải xong rồi, lập luận hợp lý. Làm tốt lắm nhé!",
] as const;
export const CLOSINGS_HELP = [
  "Bài đã xong, nhưng mình đã giúp ở một số phần. Bạn xem lại lời giải rồi làm thử một bài tương tự nhé.",
  "Bài xong rồi, tuy mình có giúp ở vài chỗ. Bạn xem lại lời giải rồi thử một bài tương tự nhé.",
  "Bạn đã đi hết bài, dù có vài chỗ mình đưa lời giải. Hãy xem lại rồi làm thử một bài tương tự nhé.",
  "Bài đã hoàn thành, nhưng có một số phần mình đã giúp. Bạn đọc lại lời giải rồi thử bài tương tự nhé.",
  "Xong bài rồi, trong đó mình hỗ trợ ở vài chỗ. Bạn xem lại lời giải rồi làm thử một bài tương tự nhé.",
] as const;
export const closing = () => pick(CLOSINGS);
export const closingHelp = () => pick(CLOSINGS_HELP);
