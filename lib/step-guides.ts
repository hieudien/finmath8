import { problemText } from "@/lib/figure";
import { numsIn, stripStep } from "@/lib/chat/progress";
import type { Problem } from "@/lib/schema/problem";

// Chỉ còn phần để SERVER chấm (kết quả chuẩn và sai lầm theo bước, do lib/step-all.ts viết). Học sinh không thấy bước nên không có mục tiêu hay gợi ý theo bước.
export type Guides = { checks: Problem["step_checks"]; traps: Problem["error_traps"] };

// Ghi kết quả chuẩn và sai lầm theo bước vào đề; mọi chỉ dẫn theo bước kiểu cũ (mục tiêu, gợi ý, dạng cần viết, câu hỏi con, ví dụ) luôn bị xóa.
// Không có (g null) thì xóa hết: các phần song song với lời giải không được lệch số bước.
export const withGuides = (p: Problem, g: Pick<Guides, "checks" | "traps"> | null): Problem => ({ ...p, step_goals: [], step_hints: [], step_checks: g?.checks ?? [], error_traps: g?.traps ?? [] });

// Các số xuất hiện lần đầu ở bước i (không có trong đề, dữ kiện, các bước trước): chính là kết quả bước đó tạo ra, gợi ý không được nêu.
export const newNumbers = (steps: string[], i: number, p: Problem): string[] => {
  const seen = new Set<string>(numsIn(`${problemText(p)} ${JSON.stringify(p.data)} ${steps.slice(0, i).join(" ")}`));
  return [...new Set<string>(numsIn(stripStep(steps[i])))].filter((n) => !seen.has(n)).slice(0, 6);
};
