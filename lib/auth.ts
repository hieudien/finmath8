import { currentUser } from "@/lib/supabase/server";
import { failResponse } from "@/lib/errors";

export async function requireUser() {
  const u = await currentUser();
  if (!u) throw new Response(JSON.stringify({ error: "Chưa đăng nhập." }), { status: 401, headers: { "content-type": "application/json" } });
  return u;
}

// Bọc handler: bắt Response ném ra từ requireUser và lỗi bất ngờ.
export function api(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof Response) return e;
      const u = await currentUser().catch(() => null);
      return failResponse(e, "teacher", new URL(req.url).pathname, { teacherId: u?.id });
    }
  };
}

export const bad = (error: string, status = 400) => Response.json({ error }, { status });
