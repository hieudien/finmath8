// Phân loại đề: nhánh (đại số/hình học/khác) và chủ đề gợi ý theo lớp. Chủ đề vẫn là chuỗi tự do; danh sách chỉ để gợi ý và để AI chọn cho đồng nhất.
export const BRANCHES = { algebra: "Đại số", geometry: "Hình học", other: "Khác" } as const;
export type Branch = keyof typeof BRANCHES;
export const BRANCH_KEYS = Object.keys(BRANCHES) as Branch[];
export const isBranch = (v: unknown): v is Branch => typeof v === "string" && v in BRANCHES;
export const branchLabel = (b: Branch | undefined) => (b ? BRANCHES[b] : "Chưa phân loại");

// Chương trình GDPT 2018, lớp 6-9. Lớp khác không có gợi ý (gõ tự do).
const TOPICS: Record<number, Record<Branch, string[]>> = {
  6: {
    algebra: ["Số tự nhiên", "Phân số", "Số thập phân", "Số nguyên", "Tỉ số và tỉ số phần trăm", "Thống kê và xác suất"],
    geometry: ["Hình học phẳng cơ bản", "Điểm, đường thẳng, đoạn thẳng, góc", "Tính đối xứng"],
    other: [],
  },
  7: {
    algebra: ["Số hữu tỉ", "Số thực", "Tỉ lệ thức, đại lượng tỉ lệ", "Biểu thức đại số, đa thức một biến", "Thống kê", "Xác suất"],
    geometry: ["Góc và đường thẳng song song", "Tam giác bằng nhau", "Quan hệ giữa các yếu tố trong tam giác", "Hình hộp chữ nhật, hình lăng trụ"],
    other: [],
  },
  8: {
    algebra: ["Đa thức nhiều biến", "Hằng đẳng thức đáng nhớ", "Phân thức đại số", "Phương trình bậc nhất một ẩn", "Hàm số bậc nhất", "Thống kê", "Xác suất"],
    geometry: ["Tứ giác", "Định lí Thalès", "Tam giác đồng dạng", "Hình chóp"],
    other: [],
  },
  9: {
    algebra: ["Hệ hai phương trình bậc nhất hai ẩn", "Phương trình bậc hai một ẩn", "Hàm số y = ax^2", "Bất đẳng thức, bất phương trình bậc nhất", "Căn bậc hai, căn bậc ba", "Thống kê", "Xác suất"],
    geometry: ["Hệ thức lượng trong tam giác vuông", "Đường tròn", "Góc với đường tròn", "Hình trụ, hình nón, hình cầu"],
    other: [],
  },
};

// Chủ đề gợi ý của một lớp (mọi nhánh, hoặc một nhánh).
export function topicsFor(grade: number, branch?: Branch): string[] {
  const t = TOPICS[grade];
  if (!t) return [];
  return branch ? t[branch] : [...t.algebra, ...t.geometry, ...t.other];
}

// Đoạn nối vào prompt AI: chọn nhánh, và chọn chủ đề trong danh sách của lớp khi có đề khớp.
export function taxonomyRule(grade: number): string {
  const t = topicsFor(grade);
  return `\nPhân loại: "branch" là "algebra" (đại số, số, hàm số, phương trình, thống kê, xác suất), "geometry" (hình học) hoặc "other" (không thuộc hai nhánh trên hoặc kết hợp khó tách).${t.length ? ` "topic" chọn đúng một mục trong danh sách sau nếu đề khớp: ${t.join("; ")}. Không khớp mục nào thì tự đặt chủ đề ngắn.` : ""}`;
}
