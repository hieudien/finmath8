import DashNav from "@/components/DashNav";
import NavProgress from "@/components/NavProgress";
import { currentUser } from "@/lib/supabase/server";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  return (
    <div className="flex min-h-[100dvh] flex-col md:flex-row">
      <NavProgress />
      <DashNav email={u?.email ?? ""} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-10 pt-6 md:px-8">{children}</main>
    </div>
  );
}
