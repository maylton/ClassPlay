import { HostRoomClient } from "@/components/live/HostRoomClient";
import { requireTeacher } from "@/lib/supabase/auth";

export default async function HostRoomPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  await requireTeacher(`/host/${sessionId}`);
  return <HostRoomClient sessionId={sessionId} />;
}
