import { Flyout, HardNav } from "@/components/Flyout";
import { ProblemEdit } from "@/components/ProblemEdit";
import { UUID } from "@/components/ProblemView";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return <HardNav />; // "new", "bulk", "imports": mở trang đầy đủ
  return <Flyout title="Sửa đề"><ProblemEdit id={id} inPanel /></Flyout>;
}
