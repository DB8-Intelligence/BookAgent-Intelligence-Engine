"use client";

import { UploadWizard } from "@/components/upload/UploadWizard";
import { RequireAuth } from "@/components/auth/RequireAuth";

export default function UploadPage() {
  return (
    <RequireAuth>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-2">Novo Processamento</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Envie um material imobiliário para o pipeline de inteligência.
        </p>
        <UploadWizard />
      </div>
    </RequireAuth>
  );
}
