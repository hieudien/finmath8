// ponytail: giới hạn trong bộ nhớ 1 instance. Dùng Redis/Upstash khi cần đếm chung nhiều instance.
const hits = new Map<string, number[]>();
let swept = 0;

// true nếu `key` vượt `max` lần trong `windowMs`.
export function limited(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  if (hits.size > 50_000) hits.clear(); // ponytail: trần cứng chống kẻ đổi khóa liên tục; mất đếm 1 lần còn hơn tràn RAM
  if (now - swept > 60_000) { // dọn khóa đã im, tránh Map phình mãi
    swept = now;
    for (const [k, a] of hits) if (now - a[a.length - 1] > 3_600_000) hits.delete(k);
  }
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}

// IP khách. Ưu tiên x-real-ip (host đặt), nếu không thì mục thứ TRUSTED_PROXY_HOPS tính từ cuối của x-forwarded-for (mặc định 1 proxy; mục đầu do client tự khai nên giả được). Đặt TRUSTED_PROXY_HOPS=2 nếu có CDN + load balancer.
export function clientIp(req: Request) {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
  return xff ? (xff.split(",").at(-hops) ?? xff.split(",")[0]).trim() : "local";
}

export const tooMany = () => Response.json({ error: "Bạn thử quá nhiều lần. Chờ vài phút rồi thử lại." }, { status: 429 });
