import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="skeleton h-8 w-48" />
      <Skeleton lines={5} />
    </div>
  );
}
