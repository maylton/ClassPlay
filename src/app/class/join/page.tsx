import { JoinClassClient } from "@/components/classes/JoinClassClient";

export default async function JoinClassPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = "" } = await searchParams;
  return <JoinClassClient initialCode={code} />;
}
