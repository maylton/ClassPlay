import { StudentJoinClient } from "@/components/live/StudentJoinClient";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const params = await searchParams;
  return <StudentJoinClient initialCode={params.code ?? ""} />;
}
