import { AppHeader } from "@/components/AppHeader";
import { LiveSessionSetup } from "@/components/live/LiveSessionSetup";
import { requireTeacher } from "@/lib/supabase/auth";
import type { LiveGameMode } from "@/lib/types";

const LIVE_GAME_MODES: readonly LiveGameMode[] = ["gap-fill", "quiz", "space-blaster", "dynamite"];

export default async function NewHostPage({ searchParams }: { searchParams: Promise<{ activity?: string; mode?: string }> }) {
  const params = await searchParams;
  const activityId = params.activity ?? "daily-routine-present-simple";
  const initialGameMode = LIVE_GAME_MODES.includes(params.mode as LiveGameMode) ? params.mode as LiveGameMode : undefined;
  const returnTo = `/host/new?activity=${encodeURIComponent(activityId)}${initialGameMode ? `&mode=${encodeURIComponent(initialGameMode)}` : ""}`;
  await requireTeacher(returnTo);
  return <div className="app-shell"><AppHeader /><LiveSessionSetup activityId={activityId} initialGameMode={initialGameMode} /></div>;
}
