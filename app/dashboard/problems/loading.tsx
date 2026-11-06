import { ListSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return <ListSkeleton title="Đang tải đề bài" form rows={5} />;
}
