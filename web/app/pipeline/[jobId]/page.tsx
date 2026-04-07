"use client";

import { useParams } from "next/navigation";
import { PipelineVisualizer } from "@/components/pipeline/PipelineVisualizer";

export default function PipelinePage() {
  const params = useParams();
  const jobId = params.jobId as string;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <PipelineVisualizer jobId={jobId} />
    </div>
  );
}
