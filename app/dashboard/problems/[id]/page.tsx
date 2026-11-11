import { ProblemView } from "@/components/ProblemView";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProblemView id={(await params).id} />;
}
