"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { bookagent, type InputType, type UserContext } from "@/lib/bookagentApi";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UploadStatus = 'idle' | 'selected' | 'uploading' | 'success' | 'error';

interface WizardState {
  step: number;
  fileUrl: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  uploadStatus: UploadStatus;
  uploadProgress: number;
  inputType: InputType | null;
  userContext: UserContext;
  webhookUrl: string;
  submitting: boolean;
  error: string | null;
}

const INITIAL: WizardState = {
  step: 0,
  fileUrl: "",
  filePath: "",
  fileName: "",
  fileSize: 0,
  uploadStatus: 'idle',
  uploadProgress: 0,
  inputType: null,
  userContext: {},
  webhookUrl: "",
  submitting: false,
  error: null,
};

const STEPS = [
  { label: "Tipo", icon: "📋" },
  { label: "Material", icon: "📎" },
  { label: "Personalizacao", icon: "🎨" },
  { label: "Opcoes", icon: "⚙️" },
  { label: "Confirmar", icon: "🚀" },
];

const INPUT_TYPES: { id: InputType; label: string; icon: string; desc: string }[] = [
  { id: "pdf", label: "PDF", icon: "📄", desc: "Book digital, apresentacao imobiliaria, folheto" },
  { id: "video", label: "Video", icon: "🎬", desc: "Tour virtual, video institucional, drone" },
  { id: "audio", label: "Audio", icon: "🎧", desc: "Podcast, narração, entrevista" },
  { id: "pptx", label: "Apresentacao", icon: "📊", desc: "PowerPoint, Keynote, Google Slides" },
  { id: "document", label: "Documento", icon: "📝", desc: "Word, texto, descritivo do empreendimento" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UploadWizard() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(INITIAL);

  function update(partial: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  function updateCtx(partial: Partial<UserContext>) {
    setState((prev) => ({
      ...prev,
      userContext: { ...prev.userContext, ...partial },
    }));
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  function canNext(): boolean {
    switch (state.step) {
      case 0: return state.inputType !== null;
      case 1: return state.uploadStatus === 'success' && state.fileUrl.length > 0;
      case 2: return true; // optional
      case 3: return true; // optional
      case 4: return true;
      default: return false;
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function handleFileSelect(file: File | null) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      update({ error: 'Apenas arquivos PDF sao aceitos.' });
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      update({ error: 'Arquivo muito grande. Maximo: 100MB.' });
      return;
    }
    update({
      fileName: file.name,
      fileSize: file.size,
      uploadStatus: 'selected',
      error: null,
    });
    // Store file reference for upload
    (window as unknown as Record<string, File>).__pendingUploadFile = file;
  }

  const handleUpload = useCallback(async () => {
    const file = (window as unknown as Record<string, File>).__pendingUploadFile;
    if (!file) return;

    update({ uploadStatus: 'uploading', uploadProgress: 10, error: null });

    try {
      const supabase = getSupabaseBrowser();
      const path = `pending/${crypto.randomUUID()}-${file.name}`;

      update({ uploadProgress: 30 });

      const { error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(path, file, { contentType: 'application/pdf', upsert: false });

      if (uploadError) {
        update({ uploadStatus: 'error', error: uploadError.message, uploadProgress: 0 });
        return;
      }

      update({ uploadProgress: 70 });

      const { data: signed, error: signError } = await supabase.storage
        .from('uploads')
        .createSignedUrl(path, 7200); // 2h

      if (signError || !signed) {
        update({ uploadStatus: 'error', error: 'Falha ao gerar link seguro', uploadProgress: 0 });
        return;
      }

      update({
        fileUrl: signed.signedUrl,
        filePath: path,
        uploadStatus: 'success',
        uploadProgress: 100,
      });

      delete (window as unknown as Record<string, File>).__pendingUploadFile;
    } catch (err) {
      update({
        uploadStatus: 'error',
        error: err instanceof Error ? err.message : 'Erro no upload',
        uploadProgress: 0,
      });
    }
  }, []);

  async function handleSubmit() {
    if (!state.inputType || !state.fileUrl) return;
    update({ submitting: true, error: null });

    try {
      const result = await bookagent.process.start({
        file_url: state.fileUrl,
        type: state.inputType,
        user_context: Object.keys(state.userContext).length > 0 ? state.userContext : undefined,
        webhook_url: state.webhookUrl || undefined,
      });
      router.push(`/pipeline/${result.job_id}`);
    } catch (err) {
      update({
        submitting: false,
        error: err instanceof Error ? err.message : "Erro ao iniciar processamento",
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex items-center">
            <button
              onClick={() => i < state.step && update({ step: i })}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                i === state.step
                  ? "bg-primary text-primary-foreground"
                  : i < state.step
                  ? "bg-emerald-500/10 text-emerald-600 cursor-pointer hover:bg-emerald-500/20"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <span>{s.icon}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={cn("w-6 h-px mx-1", i < state.step ? "bg-emerald-500" : "bg-border")} />
            )}
          </div>
        ))}
      </div>

      <Progress value={(state.step / (STEPS.length - 1)) * 100} className="h-1" />

      {/* Step content */}
      <Card>
        <CardContent className="p-6">
          {/* Step 0: Input Type */}
          {state.step === 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-1">Tipo de Material</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Selecione o tipo de arquivo que deseja processar.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {INPUT_TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => update({ inputType: t.id })}
                    className={cn(
                      "flex items-start gap-3 p-4 rounded-lg border text-left transition-all",
                      state.inputType === t.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/40 hover:bg-muted/50"
                    )}
                  >
                    <span className="text-2xl mt-0.5">{t.icon}</span>
                    <div>
                      <p className="font-medium text-sm">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                    </div>
                    {state.inputType === t.id && (
                      <Badge className="ml-auto text-[10px] bg-primary">Selecionado</Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: File Upload */}
          {state.step === 1 && (
            <div>
              <h2 className="text-lg font-semibold mb-1">Enviar Material</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Arraste seu arquivo {state.inputType?.toUpperCase()} ou clique para selecionar.
                Maximo 100MB.
              </p>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                title="Selecionar arquivo PDF"
                onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
              />

              {/* Drop zone */}
              {state.uploadStatus === 'idle' && (
                <div
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary', 'bg-primary/5'); }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove('border-primary', 'bg-primary/5'); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-primary', 'bg-primary/5');
                    handleFileSelect(e.dataTransfer.files[0] ?? null);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
                >
                  <div className="text-3xl mb-3">📄</div>
                  <p className="text-sm font-medium text-foreground">Arraste o PDF aqui</p>
                  <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
                </div>
              )}

              {/* File selected — show info + upload button */}
              {state.uploadStatus === 'selected' && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{state.fileName}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(state.fileSize)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => update({ uploadStatus: 'idle', fileName: '', fileSize: 0 })}
                    >
                      Trocar
                    </Button>
                  </div>
                  <Button onClick={handleUpload} className="w-full">
                    Enviar arquivo
                  </Button>
                </div>
              )}

              {/* Uploading */}
              {state.uploadStatus === 'uploading' && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl animate-pulse">📤</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{state.fileName}</p>
                      <p className="text-xs text-muted-foreground">Enviando...</p>
                    </div>
                  </div>
                  <Progress value={state.uploadProgress} className="h-2" />
                </div>
              )}

              {/* Success */}
              {state.uploadStatus === 'success' && (
                <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">✅</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-800">{state.fileName}</p>
                      <p className="text-xs text-emerald-600">{formatFileSize(state.fileSize)} — Enviado com sucesso</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => update({ uploadStatus: 'idle', fileName: '', fileSize: 0, fileUrl: '', filePath: '' })}
                    >
                      Trocar
                    </Button>
                  </div>
                </div>
              )}

              {/* Error */}
              {state.uploadStatus === 'error' && (
                <div className="border border-red-200 bg-red-50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">❌</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-800">Erro no upload</p>
                      <p className="text-xs text-red-600">{state.error}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => update({ uploadStatus: 'idle', error: null })}
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Personalization */}
          {state.step === 2 && (
            <div>
              <h2 className="text-lg font-semibold mb-1">Personalizacao (opcional)</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Dados do corretor/imobiliaria para personalizar os outputs gerados.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Nome</label>
                  <Input
                    placeholder="Douglas Silva Imóveis"
                    value={state.userContext.name ?? ""}
                    onChange={(e) => updateCtx({ name: e.target.value || undefined })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">WhatsApp</label>
                  <Input
                    placeholder="5571999733883"
                    value={state.userContext.whatsapp ?? ""}
                    onChange={(e) => updateCtx({ whatsapp: e.target.value || undefined })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Instagram</label>
                  <Input
                    placeholder="@corretor"
                    value={state.userContext.instagram ?? ""}
                    onChange={(e) => updateCtx({ instagram: e.target.value || undefined })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Site</label>
                  <Input
                    placeholder="https://meusite.com.br"
                    value={state.userContext.site ?? ""}
                    onChange={(e) => updateCtx({ site: e.target.value || undefined })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Regiao</label>
                  <Input
                    placeholder="Salvador - BA"
                    value={state.userContext.region ?? ""}
                    onChange={(e) => updateCtx({ region: e.target.value || undefined })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Logo URL</label>
                  <Input
                    placeholder="https://meusite.com/logo.png"
                    value={state.userContext.logo_url ?? ""}
                    onChange={(e) => updateCtx({ logo_url: e.target.value || undefined })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Options */}
          {state.step === 3 && (
            <div>
              <h2 className="text-lg font-semibold mb-1">Opcoes Avancadas (opcional)</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Configure webhook para receber notificacao quando o processamento terminar.
              </p>
              <div>
                <label className="text-sm font-medium block mb-1">Webhook URL</label>
                <Input
                  type="url"
                  placeholder="https://meu-backend.com/webhook/bookagent"
                  value={state.webhookUrl}
                  onChange={(e) => update({ webhookUrl: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Recebera um POST com o resultado quando o job completar.
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {state.step === 4 && (
            <div>
              <h2 className="text-lg font-semibold mb-1">Confirmar e Processar</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Revise os dados antes de iniciar o pipeline.
              </p>

              <div className="space-y-3 bg-muted/50 rounded-lg p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="font-medium">{state.inputType?.toUpperCase()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">URL</span>
                  <span className="font-mono text-xs truncate max-w-[300px]">{state.fileUrl}</span>
                </div>
                {state.userContext.name && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Nome</span>
                    <span>{state.userContext.name}</span>
                  </div>
                )}
                {state.userContext.whatsapp && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">WhatsApp</span>
                    <span>{state.userContext.whatsapp}</span>
                  </div>
                )}
                {state.userContext.instagram && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Instagram</span>
                    <span>{state.userContext.instagram}</span>
                  </div>
                )}
                {state.webhookUrl && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Webhook</span>
                    <span className="font-mono text-xs truncate max-w-[300px]">{state.webhookUrl}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <p className="text-xs text-blue-600">
                  O pipeline processara o material em 17 etapas: extracao, branding,
                  narrativa, media plans, blog, landing page, scoring e export.
                  Voce sera redirecionado para acompanhar o progresso.
                </p>
              </div>

              {state.error && (
                <div className="mt-4 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                  <p className="text-xs text-red-600">{state.error}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => update({ step: state.step - 1 })}
          disabled={state.step === 0}
        >
          Voltar
        </Button>

        {state.step < STEPS.length - 1 ? (
          <Button
            onClick={() => update({ step: state.step + 1 })}
            disabled={!canNext()}
          >
            Proximo
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={state.submitting || !state.inputType || !state.fileUrl}
          >
            {state.submitting ? "Processando..." : "Iniciar Pipeline"}
          </Button>
        )}
      </div>
    </div>
  );
}
