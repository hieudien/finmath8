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
});

export function evalSystem(p: Problem) {
  return `Bạn chấm năng lực giải quyết vấn đề Toán từ đoạn hội thoại giữa chatbot và học sinh. Chỉ chấm phần học sinh tự làm, không tính điểm cho phần chatbot nói hộ.
Rubric (mỗi tiêu chí 0–3): identify = hiểu đề bài (đại lượng đã cho, cần tìm, điều kiện); plan = lập kế hoạch giải (chọn hướng, cách tính); calculate = thực hiện kế hoạch (tính đúng theo kế hoạch); explain = kiểm tra và đánh giá (thử lại kết quả, so sánh, kết luận).
Đề: ${p.title}. Dữ liệu: ${JSON.stringify(p.data)}. Đáp án: ${JSON.stringify(p.solution)}.
Sai lầm có sẵn: ${JSON.stringify(p.common_errors)}. "errors" = các sai lầm trong danh sách này mà học sinh thực sự mắc (chép nguyên văn), có thể rỗng.
final_correct = học sinh tự đi tới kết luận đúng.
Học sinh có thể giải bằng cách KHÁC lời giải thông thường (đổi phương pháp, thứ tự bước khác). Cách khác mà đúng và đủ các bước toán học đi tới đáp án thì chấm như cách thông thường, đủ bước thì cho điểm tối đa; chỉ trừ điểm khi thiếu bước, tính sai hoặc lập luận sai.
Chỉ trả JSON: {"identify":n,"plan":n,"calculate":n,"explain":n,"final_correct":bool,"errors":[string]}`;
}

// Số đáp án (có trong solution mà đề chưa có). Bot chỉ được nhắc số này khi học sinh đã tự nêu.
export function answerNums(solution: unknown, given: unknown = "", steps: string[] = []) {
  const known = new Set(numsIn(JSON.stringify(given)));
  // Hệ số nhỏ (1,06; 0,85...) chỉ đứng trước dấu "=" (toán hạng) không phải bí mật: chặn nhầm thì bot không nói được cách làm.
  // ponytail: toán hạng thập phân < 10 tính là công khai; kết quả trung gian dạng đó mà không đứng sau dấu "=" sẽ lọt..
  const rhs = new Set(steps.flatMap((s) => s.split("=").slice(1).flatMap(numsIn)));
  const inSteps = numsIn(steps.join(" ")).filter((n) => (n.length >= 3 || n.includes(".")) && !(n.includes(".") && Number(n) < 10 && !rhs.has(n))); // bỏ số nhỏ (1, 2, 5...) để khỏi báo nhầm
  return [...new Set([...numsIn(JSON.stringify(solution)), ...inSteps])].filter((n) => !known.has(n));
}
const mentions = (text: string, nums: string[]) => nums.filter((n) => hasNum(text, n));
// `given` = dữ kiện đề + những gì học sinh đã nói: số đã có trong đó thì bot được nhắc lại. `steps` = số trung gian của lời giải cũng là bí mật.
export function leaks(reply: string, solution: unknown, given: unknown = "", steps: string[] = []) {
  return mentions(reply, answerNums(solution, given, steps)).length > 0 || leaksExpr(reply, solution, given);
}

// Đáp án dạng biểu thức/phương trình ("x=2", "(x-1)(x+1)", "2 nghiệm"): lời bot không được viết nguyên dạng đó khi đề và học sinh chưa nêu.
// Đáp án chữ thuần ("vô nghiệm", "B") không kiểm ở đây: câu bình thường hay dùng những từ đó. ponytail: so chuỗi chính tắc, không hiểu biểu thức tương đương.
function leaksExpr(reply: string, solution: unknown, given: unknown = "") {
  const g = canon(JSON.stringify(given));
  return texts(solution).map(canon).some((c) => c.length >= 3 && /[\d=+\-*/^()]/.test(c) && !g.includes(c) && hasWord(reply, c));
}

// Lời bot viết phép tính ra thẳng kết quả bí mật (ví dụ "cộng lại 6+14" khi 20 là kết quả của bước): không nêu số kết quả nhưng gần như nói hộ.
// Bí mật = mọi số của lời giải (kể cả số nhỏ) mà đề và học sinh chưa nêu. Chỉ dùng cho lời AI viết tự do, không dùng cho gợi ý giáo viên soạn sẵn.
// ponytail: chỉ bắt "số ⊕ số" (không hiểu "3x + 2x" hay biểu thức ba số). Nâng cấp: parser biểu thức.
// `said` = bài làm học sinh đã nộp: bot nhắc lại đúng phép học sinh đã viết (không kèm kết quả) thì không phải nói hộ, vd "kiểm tra lại 12 + 8".
const calcForm = (s: string) => s.replace(/\\(times|cdot)/g, "*").replace(/\\div/g, "/").replace(/[−–]/g, "-").replace(/[×x]/g, (c, i, s) => (/\d\s*$/.test(s.slice(0, i)) && /^\s*\d/.test(s.slice(i + 1)) ? "*" : c)).replace(/÷/g, "/");
export function leaksCalc(reply: string, solution: unknown, given: unknown = "", steps: string[] = [], said = "") {
  const known = new Set(numsIn(JSON.stringify(given)));
  const secret = new Set([...numsIn(JSON.stringify(solution)), ...numsIn(steps.join(" "))].filter((n) => !known.has(n)));
  const t = calcForm(reply);
  const mine = calcForm(said).replace(/\s+/g, "");
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*([+\-*/:])\s*(\d+(?:[.,]\d+)?)/g)) {
    const a = parseFloat(m[1].replace(",", ".")), b = parseFloat(m[3].replace(",", "."));
    const r = m[2] === "+" ? a + b : m[2] === "-" ? a - b : m[2] === "*" ? a * b : b === 0 ? NaN : a / b;
    if (!(Number.isFinite(r) && secret.has(String(+Math.abs(r).toFixed(4))))) continue;
    const resultWritten = /^\s*=/.test(t.slice((m.index ?? 0) + m[0].length));
    if (!resultWritten && mine.includes(m[0].replace(/\s+/g, ""))) continue; // phép của chính học sinh, bot chưa viết kết quả
    return true;
  }
  return false;
}
