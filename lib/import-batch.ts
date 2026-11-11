import type { Problem } from "@/lib/schema/problem";

// Một đợt nạp đề hàng loạt từ tệp Word (bảng import_batches). Đề nháp nằm trong items cho tới khi giáo viên xác nhận mới ghi vào bảng problems.
export type ItemStatus = "pending" | "drafted" | "ok" | "review" | "failed";
// pending: chưa AI làm. drafted: AI đã đọc thành đề, chưa viết lời giải. ok: đạt chuẩn. review: xong nhưng có cảnh báo cần xem. failed: lỗi (reason), có draft thì làm tiếp từ draft.
export type BatchItem = {
  statement: string;
  answers: Record<string, unknown>; // đáp số giáo viên đã xác nhận ở bước xem trước (rỗng = chưa có, AI giải)
  steps: string[]; // lời giải có sẵn trong tệp, chỉ để tham khảo
  status: ItemStatus;
  reason?: string;
  draft?: Problem;
  code?: string; // mã đề sau khi xác nhận
};
export type BatchStatus = "draft" | "confirmed" | "cancelled";
export type Fail = { name: string; reason: string };

// Phần nhẹ của một đề để gửi về trình duyệt (không kèm đề nháp đầy đủ).
export type ItemView = { status: ItemStatus; reason: string; title: string; code: string; drafted: boolean };
export const viewOf = (items: BatchItem[]): ItemView[] => items.map((it) => ({ status: it.status, reason: it.reason ?? "", title: it.draft?.title ?? "", code: it.code ?? "", drafted: !!it.draft }));

export function summary(items: BatchItem[]) {
  const n = (s: ItemStatus) => items.filter((i) => i.status === s).length;
  return { found: items.length, ok: n("ok"), review: n("review"), failed: n("failed"), pending: n("pending") + n("drafted"), withAnswer: items.filter((i) => Object.keys(i.answers).length > 0).length, saved: items.filter((i) => i.code).length };
}

// Đáp số lấy từ tệp không bao giờ được khóa: giáo viên phải tự xác nhận đề bài, lời giải và đáp án sau khi lưu.
// Nhưng lúc AI viết lời giải thì cần giữ đúng đáp số đó (chuẩn hóa chỉ giữ đáp án đã khóa), nên khóa tạm rồi mở lại.
export const holdAnswer = (p: Problem, hasAnswer: boolean): Problem => ({ ...p, answer_locked: hasAnswer });
export const releaseAnswer = (p: Problem): Problem => ({ ...p, answer_locked: false });

// Đáp số dạng dòng "tên = giá trị" <-> bản ghi, dùng ở bước xem trước.
export const answersToLines = (a: Record<string, unknown>) => Object.entries(a).map(([k, v]) => `${k} = ${v}`).join("\n");
export function linesToAnswers(s: string): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const l of s.split(/\r?\n/)) {
    const m = l.trim().match(/^([A-Za-z_]\w*)\s*[=:]\s*(.+)$/);
    if (!m) continue;
    const v = m[2].trim();
    o[m[1]] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v.replace(/^\$|\$$/g, "");
  }
  return o;
}
