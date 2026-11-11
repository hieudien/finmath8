import { Flyout } from "@/components/Flyout";

export default function Loading() {
  return <Flyout title="Đang mở đề..."><div className="skeleton h-6 w-1/2" /><div className="skeleton mt-4 h-24 w-full" /></Flyout>;
}
