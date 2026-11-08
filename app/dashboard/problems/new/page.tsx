import ProblemEditor from "@/components/ProblemEditor";

export const dynamic = "force-dynamic";

export default function Page() {
  return <ProblemEditor newCode={`BT${String(Date.now()).slice(-5)}`} />;
}
