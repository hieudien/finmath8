import { z } from "zod";
import type { Problem } from "@/lib/schema/problem";
import { hasNum, hasWord, numsIn } from "@/lib/chat/progress";
import { canon, texts } from "@/lib/answer-check";

export const evalSchema = z.object({
  identify: z.number(),
  plan: z.number(),
  calculate: z.number(),
  explain: z.number(),
  final_correct: z.boolean(),
  errors: z.array(z.string()),
  gaps: z.array(z.string()).default([]), // kiến thức nền còn thiếu (cho giáo viên), chỉ khi có bước được giải hộ
  review: z.array(z.string()).default([]), // 3 việc ôn tập cho học sinh, chỉ khi có bước được giải hộ
});

export function evalSystem(p: Problem, helped = false) {
  return `Bạn chấm năng lực giải quyết vấn đề Toán từ đoạn hội thoại giữa chatbot và học sinh. Chỉ chấm phần học sinh tự làm, không tính điểm cho phần chatbot nói hộ.
Rubric (mỗi tiêu chí 0–3): identify = nhận diện vấn đề/đại lượng; plan = lập kế hoạch/chọn cách tính; calculate = tính toán đúng; explain = đánh giá, so sánh, giải thích.
Đề: ${p.title}. Dữ liệu: ${JSON.stringify(p.data)}. Đáp án: ${JSON.stringify(p.solution)}.
Sai lầm có sẵn: ${JSON.stringify(p.common_errors)}. "errors" = các sai lầm trong danh sách này mà học sinh thực sự mắc (chép nguyên văn), có thể rỗng.
final_correct = học sinh tự đi tới kết luận đúng.
Học sinh có thể giải bằng cách KHÁC lời giải thông thường (đổi phương pháp, thứ tự bước khác). Cách khác mà đúng và đủ các bước toán học đi tới đáp án thì chấm như cách thông thường, đủ bước thì cho điểm tối đa; chỉ trừ điểm khi thiếu bước, tính sai hoặc lập luận sai.
${helped ? `Một số bước đã được bot hiện lời giải (dòng [Hệ thống] cuối): các bước đó học sinh không tự làm, không tính điểm. gaps = 2–4 kiến thức nền học sinh còn thiếu khiến kẹt ở các bước đó (cho giáo viên, nói cụ thể). review = 3 việc ôn tập ngắn, cụ thể cho học sinh, xưng "bạn", có thể kèm ví dụ bằng SỐ KHÁC; KHÔNG nêu đáp án hay số kết quả của đề này.\n` : ""}Chỉ trả JSON: {"identify":n,"plan":n,"calculate":n,"explain":n,"final_correct":bool,"errors":[string]${helped ? ',"gaps":[string],"review":[string]' : ""}}`;
}

// Số đáp án (có trong solution mà đề chưa có). Bot chỉ được nhắc số này khi học sinh đã tự nêu.
export function answerNums(solution: unknown, given: unknown = "", steps: string[] = []) {
  const known = new Set(numsIn(JSON.stringify(given)));
  // Hệ số nhỏ (1,06; 0,85...) chỉ đứng trước dấu "=" (toán hạng) không phải bí mật: chặn nhầm thì bot không nói được cách làm.
  // ponytail: toán hạng thập phân < 10 tính là công khai; kết quả trung gian dạng đó mà không đứng sau dấu "=" sẽ lọt. Nâng cấp: step_checks.result.
  const rhs = new Set(steps.flatMap((s) => s.split("=").slice(1).flatMap(numsIn)));
  const inSteps = numsIn(steps.join(" ")).filter((n) => (n.length >= 3 || n.includes(".")) && !(n.includes(".") && Number(n) < 10 && !rhs.has(n))); // bỏ số nhỏ (1, 2, 5...) để khỏi báo nhầm
  return [...new Set([...numsIn(JSON.stringify(solution)), ...inSteps])].filter((n) => !known.has(n));
}
export const mentions = (text: string, nums: string[]) => nums.filter((n) => hasNum(text, n));
// `given` = dữ kiện đề + những gì học sinh đã nói: số đã có trong đó thì bot được nhắc lại. `steps` = số trung gian của lời giải cũng là bí mật.
export function leaks(reply: string, solution: unknown, given: unknown = "", steps: string[] = []) {
  return mentions(reply, answerNums(solution, given, steps)).length > 0 || leaksExpr(reply, solution, given);
}

// Đáp án dạng biểu thức/phương trình ("x=2", "(x-1)(x+1)", "2 nghiệm"): lời bot không được viết nguyên dạng đó khi đề và học sinh chưa nêu.
// Đáp án chữ thuần ("vô nghiệm", "B") không kiểm ở đây: câu bình thường hay dùng những từ đó. ponytail: so chuỗi chính tắc, không hiểu biểu thức tương đương.
export function leaksExpr(reply: string, solution: unknown, given: unknown = "") {
  const g = canon(JSON.stringify(given));
  return texts(solution).map(canon).some((c) => c.length >= 3 && /[\d=+\-*/^()]/.test(c) && !g.includes(c) && hasWord(reply, c));
}

// Lời bot viết phép tính ra thẳng kết quả bí mật (ví dụ "cộng lại 6+14" khi 20 là kết quả của bước): không nêu số kết quả nhưng gần như nói hộ.
// Bí mật = mọi số của lời giải (kể cả số nhỏ) mà đề và học sinh chưa nêu. Chỉ dùng cho lời AI viết tự do, không dùng cho gợi ý giáo viên soạn sẵn.
// ponytail: chỉ bắt "số ⊕ số" (không hiểu "3x + 2x" hay biểu thức ba số). Nâng cấp: parser biểu thức.
export function leaksCalc(reply: string, solution: unknown, given: unknown = "", steps: string[] = []) {
  const known = new Set(numsIn(JSON.stringify(given)));
  const secret = new Set([...numsIn(JSON.stringify(solution)), ...numsIn(steps.join(" "))].filter((n) => !known.has(n)));
  const t = reply.replace(/\\(times|cdot)/g, "*").replace(/\\div/g, "/").replace(/[−–]/g, "-").replace(/[×x]/g, (c, i, s) => (/\d\s*$/.test(s.slice(0, i)) && /^\s*\d/.test(s.slice(i + 1)) ? "*" : c)).replace(/÷/g, "/");
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*([+\-*/:])\s*(\d+(?:[.,]\d+)?)/g)) {
    const a = parseFloat(m[1].replace(",", ".")), b = parseFloat(m[3].replace(",", "."));
    const r = m[2] === "+" ? a + b : m[2] === "-" ? a - b : m[2] === "*" ? a * b : b === 0 ? NaN : a / b;
    if (Number.isFinite(r) && secret.has(String(+Math.abs(r).toFixed(4)))) return true;
  }
  return false;
}
