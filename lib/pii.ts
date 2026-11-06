// Lọc thông tin nhận dạng trước khi lưu và trước khi gửi Gemini.
const RULES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]"],
  [/(\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/g, "[sdt]"],
  [/\b\d{9,12}\b/g, "[số]"],
  [/([Tt]ên)\s+(?:(?:em|tôi|mình|con)\s+)?(?:là\s+|:\s*)?\p{Lu}\p{Ll}*(?:\s+\p{Lu}\p{Ll}*){0,3}/gu, "$1 [tên]"],
  [/(học lớp|lớp)\s*8[A-Za-z]\d?\b/giu, "lớp 8"],
  [/(trường)\s+(\p{Lu}[\p{L}]*)(\s+\p{Lu}[\p{L}]*){0,4}/gu, "$1 [trường]"],
];

export function scrub(text: string) {
  return RULES.reduce((t, [re, to]) => t.replace(re, to), text);
}
