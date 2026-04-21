"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { OutputsGallery } from "@/components/outputs/OutputsGallery";
import { bookagent } from "@/lib/bookagentApi";

/** Extract a clean material name from the upload file URL */
function extractMaterialName(fileUrl: string): string {
  try {
    const path = new URL(fileUrl).pathname;
    let filename = decodeURIComponent(path.split("/").pop() || "");
    // Remove UUID prefix (e.g., "f4d32c2a-...-Mansao_Othon.pdf")
    filename = filename.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/, "");
    // Remove extension
    filename = filename.replace(/\.\w+$/, "");
    // Remove parenthetical suffixes like " (6)"
    filename = filename.replace(/\s*\(\d+\)\s*$/, "");
    // Replace underscores with spaces
    filename = filename.replace(/_/g, " ");
    return filename.trim() || "Material";
  } catch {
    return "Material";
  }
}

export default function OutputsPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const [materialName, setMaterialName] = useState<string>("");

  useEffect(() => {
    bookagent.jobs.get(jobId).then((job) => {
      const name = extractMaterialName(job.input?.file_url || "");
      setMaterialName(name);
    }).catch(() => setMaterialName("Material"));
  }, [jobId]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {materialName || "Conteudos Gerados"}
          </h1>
          {materialName && (
            <p className="text-sm text-muted-foreground">
              Conteudos gerados a partir do seu material
            </p>
          )}
        </div>
        <Link href={`/pipeline/${jobId}`}>
          <Button variant="outline" size="sm">Voltar ao Pipeline</Button>
        </Link>
      </div>

      <OutputsGallery jobId={jobId} />
    </div>
  );
}
