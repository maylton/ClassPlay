import { AppHeader } from "@/components/AppHeader";
import { LiveSessionSetup } from "@/components/live/LiveSessionSetup";
import { requireTeacher } from "@/lib/supabase/auth";

export default async function NewHostPage({ searchParams }: { searchParams: Promise<{ activity?: string }> }) {
  const params = await searchParams;
  const activityId = params.activity ?? "daily-routine-present-simple";
  await requireTeacher(`/host/new?activity=${encodeURIComponent(activityId)}`);
  return <div className="app-shell"><AppHeader /><LiveSessionSetup activityId={activityId} /></div>;
}
