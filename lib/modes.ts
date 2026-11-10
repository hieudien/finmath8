import type { Problem } from "@/lib/schema/problem";

// Kiểu học sinh tương tác với bài. Thêm kiểu mới: thêm một dòng ở đây, một engine ở lib/chat/steps.ts (hoặc file mới) và một ô nhập ở components/ChatInputs.tsx.
export type Mode = "chat" | "steps" | "quiz";
export const MODES: Record<Mode, { label: string; desc: string }> = {
  chat: { label: "Chat", desc: "Học sinh nhắn tin tự do với chatbot. Linh hoạt, nhưng chậm hơn và tốn lượt AI hơn." },
  steps: { label: "Từng bước", desc: "Học sinh nộp một bước giải mỗi lần vào ô ngắn. Nhanh hơn, ít lạc đề; đề cần có lời giải từng bước." },
  quiz: { label: "Trắc nghiệm từng bước", desc: "Mỗi bước là một câu hỏi 4 đáp án (1 đúng, 3 đáp án dễ nhầm). Học sinh phải tự tính mới chọn đúng. Không gọi AI khi làm bài; đề cần có trắc nghiệm AI tạo sẵn." },
};
export const MODE_IDS = Object.keys(MODES) as [Mode, ...Mode[]];
export const DEFAULT_MODE: Mode = "steps";
export const PICKABLE = MODE_IDS.filter((m) => m !== "chat"); // kiểu giáo viên được chọn ở Cài đặt (chat chỉ còn là kiểu lùi khi đề thiếu lời giải từng bước)
export const isMode = (v: unknown): v is Mode => typeof v === "string" && Object.hasOwn(MODES, v);

// Chuỗi lùi: "quiz" thiếu trắc nghiệm thì chạy "steps"; "steps" thiếu lời giải từng bước thì chạy chat.
export const modeFor = (mode: Mode, p: Pick<Problem, "solution_steps"> & { step_choices?: unknown[] }): Mode => {
  const n = p.solution_steps.length;
  if (mode === "quiz" && !(n && p.step_choices?.length === n)) mode = "steps";
  return mode === "steps" && !n ? "chat" : mode;
};

export const QUIZ_GREETING = "Mỗi bước có 4 đáp án, chỉ 1 đáp án đúng. Bạn tự tính rồi chọn nhé. Cần gợi ý thì bấm nút Gợi ý.";
export const MAX_WRONG = 3; // chọn sai ngần này lần ở một bước thì hiện lời giải bước đó

export const STEPS_GREETING = "Bạn viết từng bước giải vào ô bên dưới, mỗi lần một bước. Mình sẽ kiểm tra từng bước. Cần gợi ý thì bấm nút Gợi ý nhé.";
