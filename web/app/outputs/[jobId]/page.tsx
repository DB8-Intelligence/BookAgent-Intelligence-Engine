"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { OutputsGallery } from "@/components/outputs/OutputsGallery";

export default function OutputsPage() {
  const params = useParams();
  const jobId = params.jobId as string;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Artefatos</h1>
          <p className="text-xs text-muted-foreground font-mono">{jobId}</p>
        </div>
        <Link href={`/pipeline/${jobId}`}>
          <Button variant="outline" size="sm">Voltar ao Pipeline</Button>
        </Link>
      </div>

      <OutputsGallery jobId={jobId} />
    </div>
  );
}
