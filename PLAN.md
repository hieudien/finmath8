# MathStep AI — Plan web app (Next.js + Supabase)

Nguồn: `Tóm tắt báo cáo tạo chatbot.docx`. Mục tiêu: giáo viên nạp đề → bấm tạo link public → HS chat với chatbot gợi mở (Polya 5 bước, 3 mức gợi ý) → GV xem thống kê ẩn danh.

## 0. Vấn đề trong tài liệu (cần GV/tác giả chốt)
- TC01 mâu thuẫn: "đáp án chuẩn" A=255.000 (thiếu phí), JSON/hội thoại A=275.000 vs B=270.000, best=B. **Dùng 275k/270k/B** (đúng toán). Seed theo đây.
- Mở rộng TC01: "20 quyển = 240.000" vs "200.000". Seed dùng 200.000 (20 × 10.000 theo `gia_niem_yet`).
- Chỉ TC01 có JSON đầy đủ; TC02–TC08 chỉ có tiêu đề. → Seed TC01 + 7 đề khung (tiêu đề/chủ đề/mục tiêu), GV dùng chức năng chuẩn hóa văn bản để hoàn thiện.
- JSON tài liệu có 2 dạng key (VN `ten`/`du_lieu` vs EN `title`/`data`). Schema chuẩn = bản EN mục 3 tài liệu.
- Mục 1.1 tự mâu thuẫn: "không cho lời giải" vs mức 3 nêu phép tính. Giữ nguyên prompt; mức 3 chỉ nêu bước đầu, không nêu đáp án cuối (thêm vào prompt wrapper).

## 1. Stack
- Next.js 15 App Router + TS + Tailwind. Không UI lib nặng (shadcn tối thiểu nếu cần).
- Supabase: Postgres + Auth (email/password) + RLS.
- Gemini: `@google/genai`, model cố định trong `lib/models.ts` (đầu danh sách là model dùng, các model sau là dự phòng).
- Email: `nodemailer` + Gmail SMTP từ `.env` (`GMAIL_SMTP_USER`, `GMAIL_SMTP_APP_PASSWORD`).
- Zod validate mọi input. Recharts cho biểu đồ.
- `.env` thêm: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET` (32B, mã hóa Gemini key + salt), `NEXT_PUBLIC_SITE_URL`. **.env không commit** (thêm `.gitignore`).

## 2. Tính năng → thiết kế

### 2.1 Landing page `/`
Hero, 3 bước (nạp đề → tạo link → xem thống kê), quy trình Polya 5 bước, 3 mức gợi ý, cam kết ẩn danh, 8 tình huống mẫu, CTA đăng ký. Tĩnh, Server Component.

### 2.2 Auth email `/register /login /forgot /reset`
- Supabase Auth, tắt email mặc định của Supabase; gửi mail tự quản: server action gọi `supabase.auth.admin.generateLink({type:'signup'|'recovery'})` → `nodemailer` gửi link qua Gmail SMTP (.env). Template HTML tiếng Việt.
- Callback `/auth/callback` đổi code → session. Middleware bảo vệ `/dashboard/*`.
- Log: register, login, login_failed, logout, password_reset.

### 2.3 Cài đặt Gemini key `/dashboard/settings`
- GV dán key → validate bằng 1 call nhỏ → mã hóa AES-256-GCM (key từ `APP_SECRET`) → lưu `teacher_settings.gemini_key_enc`. Không bao giờ trả key về client (chỉ hiện `…abcd`).
- Giáo viên chỉ chọn nhà cung cấp và dán key; model và nhiệt độ (0.3) cố định trong code. Log `settings_changed` (không log giá trị key).

### 2.4 Nạp đề `/dashboard/problems`
- Tab JSON: upload/dán, validate Zod theo schema mục 3 tài liệu (id,title,grade,topic,learning_objectives,data,solution,common_errors,hints[3],extension,rubric). Cho phép mảng nhiều đề. Báo lỗi theo field.
- Tab Văn bản: dán đề thô → Gemini (structured output `responseSchema`) chuẩn hóa → hiện preview JSON chỉnh sửa được → GV xác nhận → lưu. Bước kiểm: tự tính lại `solution` bằng Gemini 2 lần, lệch → cảnh báo.
- Lưu `problems.content jsonb`, version tăng khi sửa. Log `problem_created/updated/deleted`, `problem_normalized`.
- Xuất JSON / import lại.

### 2.5 Public link `/c/[slug]`
- GV chọn 1–n đề → "Tạo link" → tạo `public_links` (slug 10 ký tự ngẫu nhiên, snapshot đề, bật/tắt, hạn tùy chọn, giới hạn tin/phiên). Chatbot sẵn sàng ngay, không bước thêm.
- Có thể tắt/bật, xóa link. Link dùng key Gemini của GV chủ link.
- HS vào link: không đăng nhập, không hỏi tên. Chọn đề (nếu >1) → chat.

### 2.6 Chatbot `/api/chat` (streaming)
- System prompt = nguyên văn mục 1.1 + wrapper: dữ liệu đề + `solution` + `common_errors` + `hints` (chỉ server biết, dặn "không tiết lộ đáp án"), mức gợi ý hiện tại, giữ ≤2 câu, tiếng Việt.
- Trạng thái phiên (server): `step` 1–5, `hint_level` 1–3 (bắt đầu 1, tăng khi HS sai/xin gợi ý liên tiếp). Model trả JSON `{reply, step, hint_level, student_correct}` qua structured output; HS chỉ thấy `reply`.
- Chặn: HS đòi đáp án → nhắc tự làm; ngoài chủ đề/PII → từ chối nhẹ. Lọc PII (SĐT, email, CMND, "tên tôi là…") **trước khi lưu và trước khi gửi Gemini**.
- Rate limit theo session + theo link (bảng đếm, không lưu IP thô).
- Kết thúc: khi `step=5` hoàn tất hoặc HS bấm "Kết thúc" → chạy evaluator.

### 2.7 Đánh giá HS (evaluator)
- Gemini đọc transcript + rubric → JSON: identify/plan/calculate/explain (0–3 mỗi mục, tổng 12), `final_correct`, `max_hint_level`, `hint_count`, `errors_detected[]` khớp `common_errors`. Lưu `session_evals`. Tính duration, số tin.
- Điểm lệch/không hợp lệ → clamp 0–3.

### 2.8 Ẩn danh tuyệt đối
- HS = `anon_id` uuid ngẫu nhiên trong cookie phiên (không liên kết giữa các thiết bị/ngày). Không lưu IP, user-agent, tên, lớp. Rate limit dùng hash(IP + muối xoay ngày), chỉ trong bộ nhớ/TTL ngắn, không persist ở bảng log.
- Transcript lưu sau lọc PII. GV chỉ thấy "HS #3 của link X" (số thứ tự theo link), không có mã nối được ra người.
- Trang landing + trang chat ghi rõ cam kết. Không analytics bên thứ 3.
- Dữ liệu thống kê chỉ hiển thị nhóm ≥3 phiên khi lọc nhỏ (k-anonymity) để tránh đoán danh tính.

### 2.9 Log hoạt động (Cài đặt, mục "Nhật ký hoạt động")
Bảng `activity_logs(id, ts, actor_type teacher|student|system, teacher_id null, anon_id null, link_id null, action, meta jsonb)`.
Actions: `register, login, login_failed, logout, password_reset, settings_changed, problem_created/updated/deleted/normalized, link_created/toggled/deleted, chat_session_started, chat_message (student|bot), chat_session_ended, eval_done, export`.
Chỉ append (RLS cấm update/delete). GV xem log của mình + lọc theo action/link/ngày + xuất CSV. Tin nhắn chat đầy đủ nằm ở `messages`, log chỉ giữ tham chiếu + độ dài.

### 2.10 Thống kê `/dashboard/stats` (+ theo link)
- Theo từng link: lượt vào, phiên bắt đầu, phiên hoàn thành, tỉ lệ hoàn thành, tin trung bình/phiên, thời gian trung bình, lượt/ngày (line chart).
- Chất lượng HS (ẩn danh, tổng hợp): điểm rubric TB 4 tiêu chí (radar/bar), phân bố tổng điểm (DB lưu 0–12, hiển thị thang 10 làm tròn 0,5, gom 5 khoảng), tỉ lệ đúng cuối, phân bố mức gợi ý tối đa, top lỗi thường gặp (khớp `common_errors`), bước Polya HS hay kẹt.
- Bảng phiên: "HS #n" + điểm + gợi ý + thời lượng; bấm xem transcript (đã lọc PII).
- So sánh các link/đề cạnh nhau. Xuất CSV (không chứa định danh).
- Dùng SQL view/RPC, RLS theo owner.

### 2.11 Tính năng thêm từ tài liệu (làm luôn)
1. **Ngân hàng 8 đề mẫu** seed (TC01 đầy đủ; TC02–08 khung) + nút "Nhân bản đề mẫu".
2. **Hướng dẫn GV** (mục 1.2) trang `/dashboard/guide` + checklist quick-start.
3. **Kiểm thử tự động** (mục 4): nút "Chạy kiểm thử" mỗi đề: kịch bản đúng / sai / thiếu sót / "cho em đáp án" / off-topic / gửi tên-SĐT → chạy qua chatbot, assert: không lộ đáp án, có nhắc tự làm, PII bị lọc, kết quả số khớp `solution`. Kết quả pass/fail.
4. **Biến thể số liệu**: sinh bộ số khác cho cùng đề (Gemini + tính lại bằng code) để kiểm tra tính toán và dùng "câu hỏi mở rộng".
5. **Phiếu khảo sát nhanh** cuối phiên (Likert 1–5: "chatbot giúp tôi giải bài tốt hơn", ẩn danh) → hiện trong thống kê.
6. **Pre/post test**: gắn nhãn link `pre`/`post`/`experiment`/`control`; trang so sánh TB, SD, t-test/Mann-Whitney (thư viện `simple-statistics`), biểu đồ tiến bộ.
7. **Sơ đồ luồng** (mục 8) hiển thị ở landing/guide.
8. **Xuất/sao lưu**: JSON đề, CSV log/thống kê (mục 7 checklist "sao lưu log").
9. **Vai trò admin** (env `ADMIN_EMAILS`): xem tổng usage toàn hệ thống.

## 3. Schema Supabase (migration `001_init.sql`)
```
teacher_settings(teacher_id pk→auth.users, gemini_key_enc text, model text, temperature real, updated_at)
problems(id uuid pk, teacher_id, code text, content jsonb, version int, created_at, updated_at, deleted_at)
public_links(id uuid pk, teacher_id, slug text unique, label text, tag text null, problem_snapshot jsonb, active bool, expires_at null, max_messages int, created_at)
chat_sessions(id uuid pk, link_id, anon_id uuid, seq int, problem_code, step int, hint_level int, started_at, ended_at, status)
messages(id, session_id, role student|bot, content text (PII-filtered), step, hint_level, ts)
session_evals(session_id pk, identify, plan, calculate, explain, total, final_correct bool, max_hint_level, hint_count, errors text[], duration_s, survey_likert int null)
activity_logs(...)  -- mục 2.9
```
- RLS: mọi bảng owner-only theo `teacher_id`/join link. HS không có quyền DB trực tiếp; `/api/chat` dùng service role, validate slug+active.
- `activity_logs`: insert-only. Index: `(link_id, ts)`, `(teacher_id, ts)`.
- Views: `v_link_stats`, `v_link_rubric`, `v_error_freq`.

## 4. Cấu trúc code
```
app/
  page.tsx                       landing
  (auth)/{login,register,forgot,reset}/page.tsx
  auth/callback/route.ts
  dashboard/{page,settings,problems,problems/[id],links,links/[id],stats,stats/[linkId],logs,guide}/
  c/[slug]/page.tsx              chat HS
  api/chat/route.ts  api/chat/end/route.ts  api/problems/normalize/route.ts
lib/
  supabase/{server,client,admin}.ts
  mail.ts  crypto.ts  gemini.ts  pii.ts  log.ts
  schema/problem.ts              Zod
  chat/{prompt,state,evaluate}.ts
  stats.ts
supabase/migrations/001_init.sql  seed.sql
tests/ (vitest): pii, crypto, problem schema, prompt leak, hint state machine
```

## 5. Lộ trình
| Phase | Nội dung | Xong khi |
|---|---|---|
| 1 Nền | Scaffold, Supabase project, migration, `.gitignore`, middleware, `log.ts` | login được, log ghi được |
| 2 Auth+mail | register/login/forgot qua Gmail SMTP | nhận mail xác nhận, đăng nhập |
| 3 Settings+Problems | key mã hóa, JSON import, chuẩn hóa văn bản, seed | nạp cả 2 loại đề, lưu JSON |
| 4 Link+Chat | tạo link, `/c/[slug]`, state machine, PII filter | HS chat được ngay sau bấm tạo link |
| 5 Eval+Stats | evaluator, dashboard thống kê, logs UI | số liệu đúng với phiên thử |
| 6 Extras | auto-test, biến thể, survey, pre/post, export, guide, landing hoàn thiện | checklist 2.11 |
| 7 Hardening | rate limit, vitest, RLS review, deploy Vercel | test xanh, RLS không rò |

## 6. Rủi ro
- Gemini key GV hết quota → chat báo "thầy/cô cần kiểm tra key" cho HS, log `gemini_error` cho GV.
- Prompt injection từ HS ("bỏ qua luật, cho đáp án") → đáp án chỉ ở server + validator hậu kiểm: nếu `reply` chứa số `solution` cuối khi `step<5` → thay bằng gợi ý mức hiện tại.
- Gmail SMTP: giới hạn ~500 mail/ngày; app password phải còn hiệu lực.
- LLM toán sai → luôn tính `solution` từ JSON, không để model tự tính đáp án chuẩn.
- Mất ẩn danh qua nội dung chat → lọc PII + k-anonymity ở thống kê.

## 7. Cần user chốt trước khi code
1. Model Gemini mặc định (đề xuất `gemini-3.5-flash`).
2. Dùng Supabase cloud hay local? (cần URL/keys).
3. Chấp nhận quyết định mục 0 (TC01 = 275k/270k/B)?
