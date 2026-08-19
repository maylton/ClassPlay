import { JoinClassClient } from "@/components/classes/JoinClassClient";

export default async function JoinClassPage({ searchParams }: { searchParams: Promise<{ code?: string; username?: string; complete?: string }> }) {
  const { code = "", username = "", complete = "" } = await searchParams;
  return <JoinClassClient initialCode={code} completionUsername={username} completeSignup={complete === "1"} />;
}
