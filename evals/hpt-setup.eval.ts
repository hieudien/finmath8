import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { it } from "vitest";

// Tạo 5 đề hệ phương trình dạng khác nhau cho tài khoản test, chuẩn hóa bằng đúng đường chuẩn hóa của app (AI thật, tốn key giáo viên),
// khóa đáp án (đã đối chiếu với đáp án tự tính ở EXPECT) rồi tạo một liên kết công khai để chạy hpt.eval.ts.
// Chạy: HPT_EMAIL=g.augaudev@gmail.com npx vitest run --config vitest.eval.config.mts evals/hpt-setup.eval.ts
const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).flatMap((l) => { const m = l.match(/^([A-Za-z_]+)=(.*)$/); return m ? [[m[1], m[2].replace(/^["']|["']$/g, "")]] : []; }));
const EMAIL = process.env.HPT_EMAIL ?? "g.augaudev@gmail.com";

// Đáp án AI hay viết dạng "$3$", "$\frac{3}{2}$": so theo giá trị số (mọi giá trị mong đợi phải có trong đáp án, bỏ qua tên khóa), đáp án chữ so theo chuỗi.
const val = (v: unknown): number | string => {
  if (typeof v === "number") return v;
  const t = String(v).replace(/\$/g, "").trim();
  const f = t.match(/^(-?)\\d?frac\{(\d+)\}\{(\d+)\}$/);
  if (f) return (f[1] ? -1 : 1) * Number(f[2]) / Number(f[3]);
  return /^-?\d+([.,]\d+)?$/.test(t) ? Number(t.replace(",", ".")) : t.toLowerCase();
};
const agree = (got: Record<string, unknown>, want: Record<string, unknown>) => {
  const g = Object.entries(got).filter(([k]) => k !== "ket_luan" || typeof want.ket_luan === "string").map(([, v]) => val(v));
  return Object.values(want).every((w) => g.some((x) => (typeof w === "number" ? typeof x === "number" && Math.abs(x - w) < 1e-9 : typeof x === "string" && x.includes(String(w)))));
};

type Spec = { id: string; title: string; topic: string; statement: string; expect: Record<string, unknown> };
export const SPECS: Spec[] = [
  { id: "HP01", title: "[TEST] Hệ giải bằng phương pháp thế", topic: "Hệ hai phương trình bậc nhất hai ẩn", expect: { x: 3, y: 2 },
    statement: "Giải hệ phương trình bằng phương pháp thế: $\\begin{cases} x + 2y = 7 \\\\ 3x - y = 7 \\end{cases}$" },
  { id: "HP02", title: "[TEST] Hệ giải bằng cộng đại số cần nhân hệ số", topic: "Hệ hai phương trình bậc nhất hai ẩn", expect: { x: 2, y: 3 },
    statement: "Giải hệ phương trình bằng phương pháp cộng đại số: $\\begin{cases} 3x + 2y = 12 \\\\ 5x - 3y = 1 \\end{cases}$" },
  { id: "HP03", title: "[TEST] Lập hệ phương trình giá vở và bút", topic: "Giải bài toán bằng cách lập hệ phương trình", expect: { vo: 9000, but: 7000 },
    statement: "An mua 3 quyển vở và 2 cây bút hết 41.000 đồng. Bình mua 2 quyển vở và 4 cây bút cùng loại hết 46.000 đồng. Tính giá tiền của một quyển vở và giá tiền của một cây bút (đơn vị đồng)." },
  { id: "HP04", title: "[TEST] Hệ có nghiệm thập phân", topic: "Hệ hai phương trình bậc nhất hai ẩn", expect: { x: 1.5, y: 0.5 },
    statement: "Giải hệ phương trình: $\\begin{cases} 2x + 4y = 5 \\\\ 4x - 2y = 5 \\end{cases}$" },
  { id: "HP05", title: "[TEST] Hệ vô nghiệm", topic: "Hệ hai phương trình bậc nhất hai ẩn", expect: { ket_luan: "vô nghiệm" },
    statement: "Giải hệ phương trình: $\\begin{cases} x + 2y = 3 \\\\ 2x + 4y = 5 \\end{cases}$" },
];

it("tạo và chuẩn hóa 5 đề hệ phương trình, tạo liên kết", async () => {
  Object.assign(process.env, env);
  const { admin } = await import("../lib/supabase/admin");
  const { llmCfg } = await import("../lib/teacher");
  const { standardizeProblem } = await import("../lib/fill");
  const { repairProblem } = await import("../lib/repair");
  const { problemSchema } = await import("../lib/schema/problem");
  const db = admin();

  const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
  const teacher = users.users.find((u) => u.email === EMAIL);
  if (!teacher) throw new Error("Không thấy tài khoản " + EMAIL);
  const cfg = await llmCfg(teacher.id);
  if (!cfg) throw new Error("Tài khoản chưa có API key");

  const report: Record<string, unknown>[] = [];
  const contents: unknown[] = [];
  for (const s of SPECS) {
    const draft = problemSchema.parse({ id: s.id, title: s.title, grade: 9, topic: s.topic, statement: s.statement, solution: {}, hints: [1, 2, 3].map((level) => ({ level, text: "tạm" })), reviewed: false });
    const t0 = Date.now();
    const r = await standardizeProblem(cfg, draft);
    if (typeof r === "string") { report.push({ id: s.id, ok: false, error: r }); console.log(s.id, "LỖI chuẩn hóa:", r); continue; }
    const match = agree(r.solution, s.expect);
    const final = repairProblem({ ...r, answer_locked: match, reviewed: true, check_note: match ? "" : `Đáp án AI ${JSON.stringify(r.solution)} lệch đáp án tự tính ${JSON.stringify(s.expect)}` });
    report.push({ id: s.id, ok: true, match, solution: r.solution, expect: s.expect, steps: r.solution_steps.length, ms: Date.now() - t0, check_note: r.check_note });
    console.log(s.id, match ? "khớp đáp án" : "LỆCH đáp án", JSON.stringify(r.solution), `${r.solution_steps.length} bước`, `${Math.round((Date.now() - t0) / 1000)}s`);
    if (!match) continue;
    const { data: ex } = await db.from("problems").select("id").eq("teacher_id", teacher.id).eq("code", s.id).is("deleted_at", null).maybeSingle();
    const old = ex as { id: string } | null;
    const res = old
      ? await db.from("problems").update({ content: final, updated_at: new Date().toISOString() } as never).eq("id", old.id)
      : await db.from("problems").insert({ teacher_id: teacher.id, code: s.id, content: final } as never);
    if (res.error) throw new Error(res.error.message);
    contents.push(final);
  }

  await db.from("public_links").update({ deleted_at: new Date().toISOString() } as never).eq("teacher_id", teacher.id).eq("label", "[TEST] hệ phương trình").is("deleted_at", null);
  let slug = "";
  if (contents.length) {
    slug = randomBytes(8).toString("base64url").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 10).padEnd(10, "x");
    const { error } = await db.from("public_links").insert({ teacher_id: teacher.id, slug, label: "[TEST] hệ phương trình", problems_snapshot: contents } as never);
    if (error) throw new Error(error.message);
  }
  mkdirSync("evals/out", { recursive: true });
  writeFileSync("evals/out/hpt-setup.json", JSON.stringify({ slug, report }, null, 1));
  console.log("SLUG", slug, `${contents.length}/${SPECS.length} đề đạt`);
});
