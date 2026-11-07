// Thử tải route chat. Cài k6 (https://k6.io), rồi:
//   k6 run -e BASE=http://localhost:3000 -e SLUG=<slug liên kết> -e PROBLEM=<mã bài> -e VUS=100 tests/load/chat.k6.js
// Mỗi học sinh ảo có cookie riêng, mở 1 phiên rồi gửi tin cách nhau 3 giây. Dùng liên kết thử với key AI thử: mỗi tin gọi AI thật.
import http from "k6/http";
import { check, sleep } from "k6";

export const options = { vus: Number(__ENV.VUS || 100), duration: __ENV.DURATION || "2m", thresholds: { http_req_failed: ["rate<0.02"], http_req_duration: ["p(95)<15000"] } };
const url = `${__ENV.BASE || "http://localhost:3000"}/api/chat`;
const post = (b) => http.post(url, JSON.stringify(b), { headers: { "content-type": "application/json" }, timeout: "60s" });

export default function () {
  const slug = __ENV.SLUG;
  const s = post({ action: "start", slug, problemCode: __ENV.PROBLEM });
  check(s, { "start 200": (r) => r.status === 200 });
  if (s.status !== 200) return sleep(5);
  const sessionId = s.json("sessionId");
  for (let i = 0; i < 10; i++) {
    sleep(3);
    const m = post({ action: "message", slug, sessionId, text: `Mình nghĩ bước ${i + 1} là lấy số liệu đề cho` });
    check(m, { "message 200": (r) => r.status === 200 });
  }
}
