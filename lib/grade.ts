import type { Problem } from "@/lib/schema/problem";

// Đoạn nối vào mọi prompt AI: giữ lời giải, chỉ dẫn, nhận xét trong kiến thức đã học đến hết lớp của đề.
export const gradeRule = (grade: number) =>
  `\nLỚP ${grade} (GDPT 2018): chỉ dùng kiến thức đến hết lớp ${grade}; không dùng đạo hàm, tích phân, ma trận, giới hạn hay kiến thức lớp trên. Có nhiều cách thì chọn cách của lớp ${grade}.`;

// Từ khóa kiến thức chưa học ở lớp dưới 11: thấy trong lời giải hay chỉ dẫn thì báo giáo viên.
const ABOVE = /đạo hàm|tích phân|nguyên hàm|ma trận|định thức|vi phân|giới hạn của hàm|\\lim\b|\\int\b|\\iint\b|đại học|sinh viên/i;

// Chưa học trước lớp 9 (phương trình bậc hai, Vi-ét, căn bậc ba) và trước lớp 10 (logarit, vectơ, bất phương trình bậc hai).
const BEFORE9 = /phương trình bậc hai|biệt thức|Vi-?ét|căn bậc ba|\\sqrt\[3\]/i;
const BEFORE10 = /logarit|\\log\b|\\ln\b|vectơ|véc-?tơ|\\vec\b|\\overrightarrow|bất phương trình bậc hai/i;

export function aboveGrade(p: Problem): string[] {
  if (p.grade >= 11) return [];
  const text = [...p.solution_steps, ...p.hints.map((h) => h.text), ...p.common_errors].join("\n");
  const m = text.match(ABOVE) ?? (p.grade < 9 ? text.match(BEFORE9) : null) ?? (p.grade < 10 ? text.match(BEFORE10) : null);
  return m ? [`Lời giải hoặc chỉ dẫn dùng kiến thức vượt lớp ${p.grade} ("${m[0]}"). Bấm chuẩn hóa để AI viết lại đúng lớp.`] : [];
}
