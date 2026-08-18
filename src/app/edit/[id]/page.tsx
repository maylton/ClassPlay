import { AppHeader } from "@/components/AppHeader";
import { ActivityEditor } from "@/components/ActivityEditor";
import { requireTeacher } from "@/lib/supabase/auth";

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireTeacher(`/edit/${id}`);
  return <div className="app-shell"><AppHeader /><ActivityEditor activityId={id} /></div>;
}
