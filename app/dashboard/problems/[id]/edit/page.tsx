import { ProblemEdit } from "@/components/ProblemEdit";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProblemEdit id={(await params).id} />;
}
