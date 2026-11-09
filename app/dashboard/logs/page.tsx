import { supabaseServer } from "@/lib/supabase/server";
import { Empty, LinkButton } from "@/components/ui";

type Row = { id: number; ts: string; actor_type: string; action: string; anon_id: string | null; link_id: string | null; meta: Record<string, unknown> };

const LABEL: Record<string, string> = {
  register: "Đăng ký", email_confirmed: "Xác nhận email", login: "Đăng nhập", login_failed: "Đăng nhập thất bại", logout: "Đăng xuất",
  password_reset_requested: "Yêu cầu đặt lại mật khẩu", password_reset: "Đặt lại mật khẩu", settings_changed: "Đổi cài đặt",
  problem_created: "Nạp đề", problem_updated: "Sửa đề", problem_deleted: "Xóa đề", problem_normalized: "Chuẩn hóa đề",
  link_created: "Tạo liên kết", link_toggled: "Bật/tắt liên kết", link_deleted: "Xóa liên kết",
  chat_session_started: "HS bắt đầu chat", chat_message: "Tin nhắn chat", chat_session_ended: "HS kết thúc chat",
  eval_done: "Chấm điểm xong", survey_submitted: "HS đánh giá", answer_leak_blocked: "Chặn lộ đáp án", student_distress: "⚠ HS có dấu hiệu cần người lớn hỗ trợ", session_capped: "Chốt phiên do quá số lượt", session_off_topic_closed: "Chốt phiên do lạc đề liên tục", gemini_error: "Lỗi nhà cung cấp AI", model_fallback: "Tự đổi model do hết lượt", error: "Lỗi hệ thống (gửi mã lỗi cho admin)", problem_selftest: "Kiểm thử chatbot", export: "Tải dữ liệu",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const { action } = await searchParams;
  let q = (await supabaseServer()).from("activity_logs").select("id,ts,actor_type,action,anon_id,link_id,meta").neq("action", "ai_call").neq("action", "ai_usage").order("id", { ascending: false }).limit(200);
  if (action) q = q.eq("action", action);
  const rows = ((await q).data ?? []) as Row[];
  const fmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Nhật ký hoạt động</h1>
        <LinkButton variant="secondary" href="/api/export?kind=logs">Tải CSV</LinkButton>
      </div>
      <form className="flex flex-wrap items-end gap-2" method="get">
        <div className="flex flex-col gap-1">
          <label htmlFor="action" className="text-sm font-medium">Lọc theo hoạt động</label>
          <select id="action" name="action" defaultValue={action ?? ""} className="min-h-11 rounded-sm border border-border-strong bg-surface px-3 text-base">
            <option value="">Tất cả</option>
            {Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button className="min-h-11 rounded-sm bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover">Lọc</button>
      </form>
      {rows.length === 0 ? <Empty text="Chưa có hoạt động nào khớp." /> : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <p className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{LABEL[r.action] ?? r.action}</span>
                <span className="tnum text-sm text-text-muted">{fmt.format(new Date(r.ts))}</span>
              </p>
              <p className="break-anywhere text-sm text-text-muted">
                {r.actor_type === "teacher" ? "Giáo viên" : r.actor_type === "student" ? "Học sinh" : "Hệ thống"}
                {Object.keys(r.meta).length > 0 && ` · ${JSON.stringify(r.meta)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
