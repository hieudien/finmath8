// Việc hàng loạt: server chỉ làm một lượt nhỏ trong giới hạn thời gian, client lặp lại cho tới hết.

export const CHUNK = 10; // số đề client gửi mỗi lượt
export const PAR = 4; // số đề AI làm song song trong một lượt (cao hơn dễ chạm giới hạn tốc độ của nhà cung cấp AI)
export const BUDGET_MS = 20_000; // không bắt đầu đề mới sau mốc này: một đề có thể mất đến ~35s, request tối đa 60s

// Chạy fn cho từng phần tử, tối đa n song song; không bắt đầu phần tử mới sau stopAt. Trả các phần tử chưa kịp bắt đầu.
export async function pool<T>(items: T[], n: number, stopAt: number, fn: (x: T) => Promise<void>): Promise<T[]> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length && Date.now() < stopAt) await fn(items[i++]);
  }));
  return items.slice(i);
}

// Mã đề chưa dùng, dạng BT01, BT02... (want là tiền tố hoặc mã mong muốn). Mã trùng thì tăng số.
export function freeCode(want: string, taken: Set<string>): string {
  const w = want.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "").slice(0, 20) || "BT";
  if (!taken.has(w)) return w;
  const m = /^(.*?)(\d*)$/.exec(w)!;
  const prefix = (m[1] || "BT").slice(0, 15), width = Math.max(2, m[2].length);
  for (let n = (Number(m[2]) || 0) + 1; ; n++) {
    const c = prefix + String(n).padStart(width, "0");
    if (!taken.has(c)) return c;
  }
}
