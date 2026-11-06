import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { log } from "@/lib/log";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const token_hash = q.get("token_hash");
  const type = q.get("type") as EmailOtpType | null;
  const next = q.get("next")?.startsWith("/") ? q.get("next")! : "/dashboard";
  const url = req.nextUrl.clone();
  url.search = "";
  if (token_hash && type) {
    const sb = await supabaseServer();
    const { data, error } = await sb.auth.verifyOtp({ type, token_hash });
    if (!error && data.user) {
      if (type === "signup") await log({ actor: "teacher", action: "email_confirmed", teacherId: data.user.id });
      url.pathname = next;
      return NextResponse.redirect(url);
    }
  }
  url.pathname = "/login";
  url.searchParams.set("error", "link");
  return NextResponse.redirect(url);
}
