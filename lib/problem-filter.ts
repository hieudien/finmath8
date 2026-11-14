import type { Branch } from "@/lib/taxonomy";

// Lọc đề theo lớp, nhánh, chủ đề: dùng chung cho trang Đề bài và lúc chọn đề cho liên kết. Lọc ở client, không gọi server.
export type Cls = { grade: number; branch?: Branch; topic: string };
export type Filter = { grade: string; branch: string; topic: string }; // "" = tất cả; branch "none" = chưa phân loại
export const NO_FILTER: Filter = { grade: "", branch: "", topic: "" };
export const isFiltering = (f: Filter) => !!(f.grade || f.branch || f.topic);

const sameBranch = (c: Cls, b: string) => (!b ? true : b === "none" ? !c.branch : c.branch === b);
const sameTopic = (c: Cls, t: string) => !t || c.topic.trim() === t;

export function matchClass(c: Cls, f: Filter): boolean {
  return (!f.grade || c.grade === Number(f.grade)) && sameBranch(c, f.branch) && sameTopic(c, f.topic);
}

// Các lựa chọn của từng ô lọc, tính từ chính danh sách đề: ô Chủ đề chỉ hiện chủ đề của đề đang khớp lớp và nhánh đã chọn.
export function facets(items: Cls[], f: Filter) {
  const grades = [...new Set(items.map((c) => c.grade))].sort((a, b) => a - b);
  const inScope = items.filter((c) => (!f.grade || c.grade === Number(f.grade)) && sameBranch(c, f.branch));
  const topics = [...new Set(inScope.map((c) => c.topic.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
  return { grades, topics };
}
