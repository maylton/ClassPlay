import { AppHeader } from "@/components/AppHeader";
import { ActivityEditor } from "@/components/ActivityEditor";
import { requireTeacher } from "@/lib/supabase/auth";

export default async function CreatePage() {
  await requireTeacher("/create");
  return <div className="app-shell"><AppHeader /><ActivityEditor /></div>;
}
