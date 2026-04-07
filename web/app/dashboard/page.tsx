"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { bookagent, JOB_STATUS_CONFIG, type JobListItem } from "@/lib/bookagentApi";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Uses JOB_STATUS_CONFIG from bookagentApi

export default function DashboardPage() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bookagent.jobs.list()
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{jobs.length} job(s)</p>
        </div>
        <Link href="/upload">
          <Button>Novo Job</Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Carregando jobs...</div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-4">Nenhum job encontrado</p>
            <Link href="/upload"><Button>Criar primeiro job</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const st = JOB_STATUS_CONFIG[job.status] ?? JOB_STATUS_CONFIG.pending;
            return (
              <Link key={job.job_id} href={`/pipeline/${job.job_id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">
                        {job.type === "pdf" ? "📄" : job.type === "video" ? "🎬" : job.type === "audio" ? "🎧" : "📁"}
                      </span>
                      <div>
                        <p className="font-medium text-sm">{job.job_id.slice(0, 8)}...</p>
                        <p className="text-xs text-muted-foreground">
                          {job.type.toUpperCase()} &middot; {new Date(job.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={st.bg}>{st.label}</Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
