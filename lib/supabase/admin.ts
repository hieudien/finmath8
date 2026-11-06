import { createClient } from "@supabase/supabase-js";

let c: ReturnType<typeof createClient> | undefined;
export function admin() {
  return (c ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}
