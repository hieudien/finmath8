import { ListSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return <ListSkeleton title="Đang tải tạo đề hàng loạt" rows={4} />;
}
