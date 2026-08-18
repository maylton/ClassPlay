import { AppHeader } from "@/components/AppHeader";
import { DashboardClient } from "@/components/DashboardClient";
import { requireTeacher } from "@/lib/supabase/auth";

export default async function DashboardPage() {
  await requireTeacher("/dashboard");
  return <div className="app-shell"><AppHeader /><DashboardClient /></div>;
}
