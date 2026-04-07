"use client";

import { UploadWizard } from "@/components/upload/UploadWizard";

export default function UploadPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-2">Novo Processamento</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Envie um material imobiliario para o pipeline de inteligencia.
      </p>
      <UploadWizard />
    </div>
  );
}
