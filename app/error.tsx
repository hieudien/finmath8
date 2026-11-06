"use client";
import ErrorView from "@/components/ErrorView";

export default function Error(p: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView {...p} />;
}
