import { AssignmentPlayerClient } from "@/components/classes/AssignmentPlayerClient";

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssignmentPlayerClient assignmentId={id} />;
}
