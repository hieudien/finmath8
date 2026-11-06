import { ListSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return <ListSkeleton title="Đang tải liên kết" form rows={3} />;
}
