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

export const GET = api(async (req) => {
  const u = await requireUser();
  const kind = new URL(req.url).searchParams.get("kind");
  const sb = await supabaseServer();
  let rows: Record<string, unknown>[] = [];
  if (kind === "logs") {
    rows = ((await sb.from("activity_logs").select("ts,actor_type,action,meta").order("id", { ascending: false }).limit(5000)).data ?? []) as Record<string, unknown>[];
  } else if (kind === "stats") {
    const [{ data: s }, { data: e }] = await Promise.all([sb.from("chat_sessions").select("id,link_id,seq,problem_code,status"), sb.from("session_evals").select("*")]);
    const ev = new Map(((e ?? []) as { session_id: string }[]).map((x) => [x.session_id, x]));
    rows = ((s ?? []) as { id: string; link_id: string; seq: number; problem_code: string; status: string }[]).map((x) => {
      const r = (ev.get(x.id) ?? {}) as Record<string, unknown>;
      return { link: x.link_id, hs: `HS#${x.seq}`, bai: x.problem_code, trang_thai: x.status, nhan_dien: r.identify, ke_hoach: r.plan, tinh_toan: r.calculate, giai_thich: r.explain, tong: r.total, dung: r.final_correct, goi_y_max: r.max_hint_level, giay: r.duration_s, hai_long: r.survey_likert };
    });
  } else if (kind === "chat") {
    const { data: ss, error: e1 } = await sb.from("chat_sessions").select("id,seq,link_id,problem_code");
    const { data: ms, error: e2 } = await sb.from("messages").select("session_id,role,content,ts").order("id").limit(50000);
    if (e1 || e2) throw new Error("Lỗi cơ sở dữ liệu: " + (e1 ?? e2)!.message);
    const by = new Map(((ss ?? []) as { id: string; seq: number; link_id: string; problem_code: string }[]).map((x) => [x.id, x]));
    rows = ((ms ?? []) as { session_id: string; role: string; content: string; ts: string }[]).map((m) => {
      const x = by.get(m.session_id);
      return { link: x?.link_id, hs: x ? `HS#${x.seq}` : "", bai: x?.problem_code, thoi_gian: m.ts, vai_tro: m.role === "bot" ? "chatbot" : "hoc_sinh", noi_dung: m.content };
    });
  } else return bad("kind không hợp lệ.");
  await log({ actor: "teacher", action: "export", teacherId: u.id, meta: { kind, rows: rows.length } });
  return new Response("﻿" + csv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="finmath8-${kind}.csv"` } });
});
