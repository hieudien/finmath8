// Đoán ý định tin nhắn (câu hỏi hay bước giải). Module thuần, không phụ thuộc server: client và server dùng chung.
// ponytail: đoán theo từ khóa tiếng Việt. Nâng cấp: nhờ AI phân loại.
export const QUESTION = /\?|gì|sao|nào|không hiểu|chưa hiểu|nghĩa|ví dụ|giúp|thế nào|là j|hỏi|cách|tại sao|vì sao/i;
export const looksLikeQuestion = (text: string) => QUESTION.test(text);
// Phía client không có dữ liệu đề: chỉ coi là bước giải khi có dấu "=" và không có dấu hiệu câu hỏi.
export const looksLikeStepText = (text: string) => !QUESTION.test(text) && /[=＝]/.test(text);
