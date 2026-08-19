import { AppHeader } from "@/components/AppHeader";
import { ClassesClient } from "@/components/classes/ClassesClient";
import { requireTeacher } from "@/lib/supabase/auth";

export default async function ClassesPage() {
  await requireTeacher("/classes");
  return <div className="app-shell"><AppHeader /><ClassesClient /></div>;
}
