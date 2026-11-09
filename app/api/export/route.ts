import { supabaseServer } from "@/lib/supabase/server";
import { api, bad, requireUser } from "@/lib/auth";
import { log } from "@/lib/log";

const cell = (v: unknown) => {
  const s = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
  return /^[=+\-@]/.test(s) ? `'${s}` : s; // chặn CSV injection
};
const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return "";
  const h = Object.keys(rows[0]);
  return [h.join(","), ...rows.map((r) => h.map((k) => `"${cell(r[k]).replace(/"/g, '""')}"`).join(","))].join("\n");
};

// PostgREST cắt 1000 dòng mỗi truy vấn: đọc từng trang rồi nối lại, tối đa MAX dòng.
const PAGE = 1000, MAX = 50_000;
async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let i = 0; i < MAX; i += PAGE) {
    const { data, error } = await q(i, i + PAGE - 1);
    if (error) throw new Error("Lỗi cơ sở dữ liệu: " + error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export const GET = api(async (req) => {
  const u = await requireUser();
  const kind = new URL(req.url).searchParams.get("kind");
  const sb = await supabaseServer();
  let rows: Record<string, unknown>[] = [];
  if (kind === "logs") {
    rows = ((await sb.from("activity_logs").select("ts,actor_type,action,meta").neq("action", "ai_usage").order("id", { ascending: false }).limit(5000)).data ?? []) as Record<string, unknown>[];
  } else if (kind === "stats") {
    const [s, e] = await Promise.all([
      all<{ id: string; link_id: string; seq: number; problem_code: string; status: string; student_code: string | null; student_name: string | null }>((a, z) => sb.from("chat_sessions").select("id,link_id,seq,problem_code,status,student_code,student_name").order("started_at").order("id").range(a, z)),
      all<{ session_id: string }>((a, z) => sb.from("session_evals").select("*").order("session_id").range(a, z)),
    ]);
    const ev = new Map(e.map((x) => [x.session_id, x]));
    rows = s.map((x) => {
      const r = (ev.get(x.id) ?? {}) as Record<string, unknown>;
      return { link: x.link_id, ma_hs: x.student_code, ten_hs: x.student_name, bai: x.problem_code, trang_thai: x.status, nhan_dien: r.identify, ke_hoach: r.plan, tinh_toan: r.calculate, giai_thich: r.explain, tong: r.total, dung: r.final_correct, goi_y_max: r.max_hint_level, giay: r.duration_s, hai_long: r.survey_likert, tu_tin: r.confidence };
    });
  } else if (kind === "chat") {
    const [ss, ms] = await Promise.all([
      all<{ id: string; seq: number; link_id: string; problem_code: string; student_code: string | null; student_name: string | null }>((a, z) => sb.from("chat_sessions").select("id,seq,link_id,problem_code,student_code,student_name").order("started_at").order("id").range(a, z)),
      all<{ session_id: string; role: string; content: string; ts: string }>((a, z) => sb.from("messages").select("session_id,role,content,ts").order("id").range(a, z)),
    ]);
    const by = new Map(ss.map((x) => [x.id, x]));
    rows = ms.map((m) => {
      const x = by.get(m.session_id);
      return { link: x?.link_id, ma_hs: x?.student_code, ten_hs: x?.student_name, bai: x?.problem_code, thoi_gian: m.ts, vai_tro: m.role === "bot" ? "chatbot" : "hoc_sinh", noi_dung: m.content };
    });
  } else return bad("kind không hợp lệ.");
  await log({ actor: "teacher", action: "export", teacherId: u.id, meta: { kind, rows: rows.length } });
  return new Response("﻿" + csv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="mathstep-${kind}.csv"` } });
});
