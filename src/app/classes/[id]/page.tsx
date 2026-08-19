import { AppHeader } from "@/components/AppHeader";
import { ClassDetailClient } from "@/components/classes/ClassDetailClient";
import { requireTeacher } from "@/lib/supabase/auth";

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTeacher("/classes");
  const { id } = await params;
  return <div className="app-shell"><AppHeader /><ClassDetailClient classroomId={id} /></div>;
}
