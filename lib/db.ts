type R<T> = { data: T | null; error: { message: string } | null };

// Supabase không ném lỗi mà trả { error }. Các hàm này ném lỗi để lớp bọc lỗi ghi log và báo người dùng.
export function check(r: { error: { message: string } | null }) {
  if (r.error) throw new Error("Lỗi cơ sở dữ liệu: " + r.error.message);
}

export function rows<T>(r: R<T[]>): T[] {
  if (r.error) throw new Error("Lỗi cơ sở dữ liệu: " + r.error.message);
  return r.data ?? [];
}
