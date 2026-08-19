import { StudentClassClient } from "@/components/classes/StudentClassClient";

export default async function StudentClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudentClassClient classroomId={id} />;
}
