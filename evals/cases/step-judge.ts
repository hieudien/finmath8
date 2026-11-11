import { readFileSync } from "node:fs";
import { z } from "zod";

// Bộ case chấm bước: mỗi case là một tin học sinh nộp ở một bước của một đề, kèm kết quả mong đợi (nhãn và các bước được ghi nhận).
// Dùng để đo/kiểm lại việc ghi nhận bước bằng code (lib/chat/progress.ts: markByNumbers, hasWord). Hướng "AI chấm mọi bước" đã bỏ (đo: không hơn luồng cứng + AI cho bước không có số).
// Nguồn: các phiên thật (source = mã phiên) và các tin tổng hợp (source = "synthetic") để chặn lỗi đã gặp. Nhãn do người viết, cần người duyệt.
//
// verdict (mong đợi):
//   du              đủ việc của bước (kể cả viết cách khác nhưng tương đương)
//   thieu           đúng hướng nhưng còn thiếu một phần
//   sai             có làm nhưng sai kết quả hoặc sai cách
//   khong_lien_quan có biểu thức/số nhưng không xuất phát từ đề
//   chua_lam        mảnh dở, vô nghĩa, hoặc trả lời chung chung không có nội dung toán
//   hoi             đang hỏi/nhờ giải thích, chưa nộp bước
//   xin_dap_an      đòi đáp án, nhờ làm hộ, hoặc bảo bỏ qua hướng dẫn
//   lac_de          nói chuyện ngoài bài Toán
//   nhay_coc        đưa kết quả của bước sau khi bước hiện tại chưa làm
// Quy ước nhãn (đã chốt, dùng để phân xử các ca nhập nhằng):
//   - Tin có nội dung toán ĐÚNG HƯỚNG nhưng chưa viết ra biểu thức đạt đích của bước ("nhân với 2", "thay m = 1", "7y=7" khi bước cần y) -> thieu.
//   - Tin không có nội dung toán ("ok", "em chưa", số rời, mảnh dở) -> chua_lam.
//   - Sai cách làm (nhân cả hai phương trình) hoặc sai kết quả -> sai.
//   - Có biểu thức/số nhưng không xuất phát từ đề (hệ của bài khác, phương trình bịa) -> khong_lien_quan.
//   - Bó tay, đòi đáp án, nhờ làm hộ, bảo bỏ qua hướng dẫn -> xin_dap_an.
//   - Đích của bước gồm nhiều ý (gọi ẩn VÀ đặt điều kiện) mà thiếu một ý -> thieu.
//   - Viết cách khác nhưng tương đương (30:x, vế đảo của phương trình) -> du.
//   - Kết quả của bước sau khi bước hiện tại chưa làm -> nhay_coc (không ghi nhận bước nào).
// credit: các bước (đếm từ 1) được ghi nhận là xong nhờ tin này. [] nghĩa là không bước nào.
export const VERDICTS = ["du", "thieu", "sai", "khong_lien_quan", "chua_lam", "hoi", "xin_dap_an", "lac_de", "nhay_coc"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const caseSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  problem: z.string().min(1), // mã đề trong DB
  step: z.number().int().min(1), // bước học sinh đang làm (đếm từ 1)
  text: z.string().min(1),
  history: z.array(z.object({ role: z.enum(["bot", "student"]), text: z.string().min(1) })).default([]), // vài tin ngay trước tin này, cho case phụ thuộc ngữ cảnh
  expect: z.object({ verdict: z.enum(VERDICTS), credit: z.array(z.number().int().min(1)) }),
  note: z.string().default(""),
});
export type StepJudgeCase = z.infer<typeof caseSchema>;

export const loadStepJudgeCases = (): StepJudgeCase[] =>
  z.array(caseSchema).parse(JSON.parse(readFileSync(new URL("./step-judge.json", import.meta.url), "utf8")));
