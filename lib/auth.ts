import { AsyncLocalStorage } from "node:async_hooks";
import { currentUser } from "@/lib/supabase/server";
import { failResponse, watchdog, type Trace } from "@/lib/errors";

export type { Trace };

// Dấu vết của request đang chạy: requireUser gán teacherId vào đây, nên đồng hồ canh và nhánh lỗi biết giáo viên nào mà không phải tra lại.
const current = new AsyncLocalStorage<Trace>();

export async function requireUser() {
  const u = await currentUser();
  if (!u) throw new Response(JSON.stringify({ error: "Chưa đăng nhập." }), { status: 401, headers: { "content-type": "application/json" } });
  const tr = current.getStore();
  if (tr) tr.teacherId = u.id;
  return u;
}

// Bọc handler: bắt Response ném ra từ requireUser và lỗi bất ngờ. Ghi kèm action và thời lượng;
// request chạy quá 55s thì đồng hồ canh ghi trước khi hosting cắt.
export function api(fn: (req: Request, tr: Trace) => Promise<Response>) {
  return async (req: Request) => {
    const where = new URL(req.url).pathname, tr: Trace = { actor: "teacher" }, t0 = Date.now();
    const stop = watchdog(where, tr);
    try {
      return await current.run(tr, () => fn(req, tr));
    } catch (e) {
      if (e instanceof Response) return e;
      const teacherId = tr.teacherId ?? (await currentUser().catch(() => null))?.id; // route không gọi requireUser thì tra lại
      return failResponse(e, "teacher", where, { teacherId, meta: { action: tr.action, ms: Date.now() - t0 } });
    } finally {
      stop();
    }
  };
}

export const bad = (error: string, status = 400) => Response.json({ error }, { status });
