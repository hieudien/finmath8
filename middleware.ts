import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  let sub: string | undefined;
  let down = false;
  try {
    sub = (await sb.auth.getClaims()).data?.claims?.sub;
  } catch {
    down = true; // Supabase không phản hồi: đưa về trang đăng nhập kèm thông báo, không để trang trắng
  }
  if (!sub) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    if (down) url.searchParams.set("error", "server");
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/dashboard/:path*"] };
