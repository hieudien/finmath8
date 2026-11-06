import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* Server Component: bỏ qua, middleware làm mới */ }
      },
    },
  });
}

// getClaims kiểm tra JWT cục bộ (không gọi mạng sau lần đầu), nhanh hơn getUser ~100ms mỗi lần.
export const currentUser = cache(async () => {
  const { data } = await (await supabaseServer()).auth.getClaims();
  const c = data?.claims;
  return c?.sub ? { id: c.sub, email: (c.email as string | undefined) ?? "" } : null;
});
