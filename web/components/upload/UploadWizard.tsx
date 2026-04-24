"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { bookagent, type InputType, type UserContext } from "@/lib/bookagentApi";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UploadStatus = "idle" | "selected" | "uploading" | "success" | "error";

interface WizardState {
  step: number;
  fileUrl: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  uploadStatus: UploadStatus;
  uploadProgress: number;
  authorizationAcknowledged: boolean;
  authorizationTimestamp: string | null;
  inputType: InputType | null;
  userContext: UserContext;
  selectedFormats: string[];
  submitting: boolean;
  error: string | null;
}

// Produtos selecionáveis pelo usuário
const SELECTABLE_PRODUCTS = [
  { id: "reel", icon: "🎬", label: "Reels para Instagram/TikTok", desc: "Videos curtos 9:16 com Ken Burns e narracao", default: true },
  { id: "carousel", icon: "📱", label: "Carrossel de imagens", desc: "8-10 slides para feed do Instagram", default: true },
  { id: "blog", icon: "📝", label: "Artigo para blog", desc: "Post SEO-otimizado com 1500+ palavras", default: true },
  { id: "landing_page", icon: "🌐", label: "Landing page", desc: "Pagina de captacao com CTA e lead form", default: true },
  { id: "presentation", icon: "📊", label: "Apresentacao comercial", desc: "Slides para reuniao com cliente", default: false },
  { id: "video_long", icon: "🎥", label: "Video institucional", desc: "Video longo 16:9 para YouTube", default: false },
];

const INITIAL: WizardState = {
  step: 0,
  fileUrl: "",
  filePath: "",
  fileName: "",
  fileSize: 0,
  uploadStatus: "idle",
  uploadProgress: 0,
  authorizationAcknowledged: false,
  authorizationTimestamp: null,
  inputType: null,
  userContext: {},
  selectedFormats: SELECTABLE_PRODUCTS.filter(p => p.default).map(p => p.id),
  submitting: false,
  error: null,
};

const STEPS = [
  { label: "Material", icon: "📎" },
  { label: "Upload", icon: "📤" },
  { label: "Personalizacao", icon: "🎨" },
  { label: "Produtos", icon: "📦" },
  { label: "Processar", icon: "🚀" },
];

const INPUT_TYPES: {
  id: InputType;
  label: string;
  icon: string;
  desc: string;
  accept: string;
}[] = [
  {
    id: "pdf",
    label: "Book PDF",
    icon: "📄",
    desc: "Book digital, apresentacao imobiliaria, folheto",
    accept: ".pdf,application/pdf",
  },
  {
    id: "video",
    label: "Video",
    icon: "🎬",
    desc: "Tour virtual, video institucional, drone",
    accept: "video/*",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UploadWizard() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(INITIAL);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function update(partial: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  function updateCtx(partial: Partial<UserContext>) {
    setState((prev) => ({
      ...prev,
      userContext: { ...prev.userContext, ...partial },
    }));
  }

  function canNext(): boolean {
    switch (state.step) {
      case 0:
        return state.inputType !== null;
      case 1:
        return (
          state.uploadStatus === "success" &&
          state.fileUrl.length > 0 &&
          state.authorizationAcknowledged
        );
      case 2:
        return true;
      case 3:
        return state.selectedFormats.length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  }

  function toggleFormat(id: string) {
    setState((prev) => {
      const has = prev.selectedFormats.includes(id);
      return {
        ...prev,
        selectedFormats: has
          ? prev.selectedFormats.filter((f) => f !== id)
          : [...prev.selectedFormats, id],
      };
    });
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  const currentType = INPUT_TYPES.find((t) => t.id === state.inputType);
  const acceptTypes = currentType?.accept ?? ".pdf,application/pdf";

  function handleFileSelect(file: File | null) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      update({ error: "Arquivo muito grande. Maximo: 100MB." });
      return;
    }
    update({
      fileName: file.name,
      fileSize: file.size,
      uploadStatus: "selected",
      error: null,
    });
    (window as unknown as Record<string, File>).__pendingUploadFile = file;
  }

  const handleUpload = useCallback(async () => {
    const file = (window as unknown as Record<string, File>).__pendingUploadFile;
    if (!file) return;

    update({ uploadStatus: "uploading", uploadProgress: 10, error: null });

    try {
      // 1. Pede signed URL pro backend (/api/v1/uploads/signed-url)
      const user = getFirebaseAuth().currentUser;
      if (!user) {
        update({ uploadStatus: "error", error: "Sessão expirada. Faça login.", uploadProgress: 0 });
        return;
      }
      const token = await user.getIdToken();

      update({ uploadProgress: 20 });

      const signedRes = await fetch("/api/v1/uploads/signed-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!signedRes.ok) {
        update({ uploadStatus: "error", error: `Falha ao gerar URL (${signedRes.status})`, uploadProgress: 0 });
        return;
      }
      const signedJson = await signedRes.json();
      const { uploadUrl, gcsPath, publicUrl, path } = signedJson.data ?? {};

      if (!uploadUrl || !gcsPath) {
        update({ uploadStatus: "error", error: "Resposta inválida do servidor", uploadProgress: 0 });
        return;
      }

      update({ uploadProgress: 40 });

      // 2. PUT direto no GCS via signed URL
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!putRes.ok) {
        update({ uploadStatus: "error", error: `Upload falhou (${putRes.status})`, uploadProgress: 0 });
        return;
      }

      update({
        // Pipeline consome gs:// URI — não precisa de signed URL de download
        fileUrl: gcsPath,
        filePath: path,
        uploadStatus: "success",
        uploadProgress: 100,
        // publicUrl exposto pra debug; não usado no pipeline
        publicUrl,
      } as Parameters<typeof update>[0]);

      delete (window as unknown as Record<string, File>).__pendingUploadFile;
    } catch (err) {
      update({
        uploadStatus: "error",
        error: err instanceof Error ? err.message : "Erro no upload",
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
        user_context:
          Object.keys(state.userContext).length > 0
            ? state.userContext
            : undefined,
        selected_formats: state.selectedFormats.length > 0
          ? state.selectedFormats
          : undefined,
        authorization_acknowledged: state.authorizationAcknowledged || undefined,
        authorization_timestamp: state.authorizationTimestamp || undefined,
      });
      router.push(`/pipeline/${result.job_id}`);
    } catch (err) {
      update({
        submitting: false,
        error:
          err instanceof Error
            ? err.message
            : "Erro ao iniciar processamento",
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
              type="button"
              onClick={() => i < state.step && update({ step: i })}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                i === state.step
                  ? "bg-primary text-primary-foreground"
                  : i < state.step
                    ? "bg-emerald-500/10 text-emerald-600 cursor-pointer hover:bg-emerald-500/20"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <span>{s.icon}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-6 h-px mx-1",
                  i < state.step ? "bg-emerald-500" : "bg-border",
                )}
              />
            )}
          </div>
        ))}
      </div>

      <Progress
        value={(state.step / (STEPS.length - 1)) * 100}
        className="h-1"
      />

      {/* Step content */}
      <Card>
        <CardContent className="p-6">
          {/* Step 0: Material Type */}
          {state.step === 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-1">
                Que tipo de material voce tem?
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Selecione o formato do arquivo que deseja processar.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {INPUT_TYPES.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => update({ inputType: t.id })}
                    className={cn(
                      "flex items-start gap-3 p-4 rounded-lg border text-left transition-all",
                      state.inputType === t.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/40 hover:bg-muted/50",
                    )}
                  >
                    <span className="text-2xl mt-0.5">{t.icon}</span>
                    <div>
                      <p className="font-medium text-sm">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.desc}
                      </p>
                    </div>
                    {state.inputType === t.id && (
                      <Badge className="ml-auto text-[10px] bg-primary">
                        Selecionado
                      </Badge>
                    )}
                  </button>
                ))}
              </div>

              {/* What can be generated */}
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  Produtos disponiveis (voce escolhe quais gerar no passo 4):
                </h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {SELECTABLE_PRODUCTS.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50"
                    >
                      <span className="text-base mt-0.5">{o.icon}</span>
                      <div>
                        <p className="text-xs font-medium">{o.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {o.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 1: File Upload */}
          {state.step === 1 && (
            <div>
              <h2 className="text-lg font-semibold mb-1">Enviar Material</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Arraste seu arquivo ou clique para selecionar. Maximo 100MB.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept={acceptTypes}
                className="hidden"
                title="Selecionar arquivo"
                onChange={(e) =>
                  handleFileSelect(e.target.files?.[0] ?? null)
                }
              />

              {/* Drop zone */}
              {state.uploadStatus === "idle" && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add(
                      "border-primary",
                      "bg-primary/5",
                    );
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove(
                      "border-primary",
                      "bg-primary/5",
                    );
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove(
                      "border-primary",
                      "bg-primary/5",
                    );
                    handleFileSelect(e.dataTransfer.files[0] ?? null);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
                >
                  <div className="text-3xl mb-3">
                    {currentType?.icon ?? "📄"}
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    Arraste o arquivo aqui
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ou clique para selecionar
                  </p>
                </div>
              )}

              {/* File selected */}
              {state.uploadStatus === "selected" && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{currentType?.icon ?? "📄"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {state.fileName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(state.fileSize)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        update({
                          uploadStatus: "idle",
                          fileName: "",
                          fileSize: 0,
                        })
                      }
                    >
                      Trocar
                    </Button>
                  </div>
                  <Button type="button" onClick={handleUpload} className="w-full">
                    Enviar arquivo
                  </Button>
                </div>
              )}

              {/* Uploading */}
              {state.uploadStatus === "uploading" && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl animate-pulse">📤</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{state.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        Enviando...
                      </p>
                    </div>
                  </div>
                  <Progress value={state.uploadProgress} className="h-2" />
                </div>
              )}

              {/* Success */}
              {state.uploadStatus === "success" && (
                <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">✅</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-800">
                        {state.fileName}
                      </p>
                      <p className="text-xs text-emerald-600">
                        {formatFileSize(state.fileSize)} — Enviado com sucesso
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        update({
                          uploadStatus: "idle",
                          fileName: "",
                          fileSize: 0,
                          fileUrl: "",
                          filePath: "",
                        })
                      }
                    >
                      Trocar
                    </Button>
                  </div>
                </div>
              )}

              {/* Error */}
              {state.uploadStatus === "error" && (
                <div className="border border-red-200 bg-red-50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">❌</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-800">
                        Erro no upload
                      </p>
                      <p className="text-xs text-red-600">{state.error}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      update({ uploadStatus: "idle", error: null })
                    }
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}

              {/* Authorization checkbox */}
              {(state.uploadStatus === "success" ||
                state.uploadStatus === "selected") && (
                <label className="flex items-start gap-3 mt-6 p-4 rounded-lg border border-amber-200 bg-amber-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={state.authorizationAcknowledged}
                    onChange={(e) =>
                      update({
                        authorizationAcknowledged: e.target.checked,
                        authorizationTimestamp: e.target.checked
                          ? new Date().toISOString()
                          : null,
                      })
                    }
                    className="mt-1 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-semibold text-amber-900 mb-1">
                      Declaracao de autorizacao
                    </p>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Declaro que possuo autorizacao do proprietario deste
                      material (imobiliaria, construtora ou detentor dos
                      direitos) para utiliza-lo na geracao de conteudo digital
                      para fins de divulgacao profissional. Assumo total
                      responsabilidade pelo uso do material enviado e pelo
                      conteudo gerado a partir dele.
                    </p>
                    <p className="text-xs text-amber-700 mt-2 leading-relaxed">
                      Entendo que a BookReel processa o material com base nesta
                      declaracao e nao verifica independentemente a titularidade
                      dos direitos autorais.
                    </p>
                  </div>
                </label>
              )}
            </div>
          )}

          {/* Step 2: Personalization */}
          {state.step === 2 && (
            <div>
              <h2 className="text-lg font-semibold mb-1">
                Personalizacao (opcional)
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Dados do corretor ou imobiliaria para personalizar os conteudos gerados.
                Pule se preferir — pode editar depois.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Nome</label>
                  <Input
                    placeholder="Douglas Silva Imoveis"
                    value={state.userContext.name ?? ""}
                    onChange={(e) =>
                      updateCtx({ name: e.target.value || undefined })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">
                    WhatsApp
                  </label>
                  <Input
                    placeholder="5571999733883"
                    value={state.userContext.whatsapp ?? ""}
                    onChange={(e) =>
                      updateCtx({ whatsapp: e.target.value || undefined })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">
                    Instagram
                  </label>
                  <Input
                    placeholder="@corretor"
                    value={state.userContext.instagram ?? ""}
                    onChange={(e) =>
                      updateCtx({ instagram: e.target.value || undefined })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">
                    Regiao
                  </label>
                  <Input
                    placeholder="Salvador - BA"
                    value={state.userContext.region ?? ""}
                    onChange={(e) =>
                      updateCtx({ region: e.target.value || undefined })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Product Selection */}
          {state.step === 3 && (
            <div>
              <h2 className="text-lg font-semibold mb-1">
                Escolha os produtos
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Selecione quais conteudos deseja gerar a partir do seu material.
                Cada produto consome creditos do seu plano.
              </p>

              <div className="grid sm:grid-cols-2 gap-3">
                {SELECTABLE_PRODUCTS.map((product) => {
                  const isSelected = state.selectedFormats.includes(product.id);
                  return (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => toggleFormat(product.id)}
                      className={cn(
                        "flex items-start gap-3 p-4 rounded-lg border text-left transition-all",
                        isSelected
                          ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20"
                          : "border-border hover:border-muted-foreground/30 hover:bg-muted/50",
                      )}
                    >
                      <span className="text-2xl mt-0.5">{product.icon}</span>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{product.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {product.desc}
                        </p>
                      </div>
                      <div className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-1 transition-colors",
                        isSelected
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-muted-foreground/30",
                      )}>
                        {isSelected && <span className="text-xs">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {state.selectedFormats.length} produto(s) selecionado(s)
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => update({ selectedFormats: SELECTABLE_PRODUCTS.map(p => p.id) })}
                  >
                    Selecionar todos
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => update({ selectedFormats: [] })}
                  >
                    Limpar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Confirm + Process */}
          {state.step === 4 && (
            <div>
              <h2 className="text-lg font-semibold mb-1">
                Confirmar e Processar
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Revise os dados e inicie o processamento.
              </p>

              <div className="space-y-3 bg-muted/50 rounded-lg p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="font-medium">
                    {currentType?.label ?? state.inputType?.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Arquivo</span>
                  <span className="text-xs truncate max-w-[250px]">
                    {state.fileName} ({formatFileSize(state.fileSize)})
                  </span>
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
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Produtos</span>
                  <span className="text-xs">
                    {state.selectedFormats
                      .map((id) => SELECTABLE_PRODUCTS.find((p) => p.id === id)?.label ?? id)
                      .join(", ")}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Autorizacao</span>
                  <span className="text-emerald-600 text-xs">Declarada</span>
                </div>
              </div>

              <div className="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <p className="text-xs text-blue-600">
                  O BookReel vai analisar seu material e identificar o que pode ser criado.
                  Na proxima etapa voce escolhe quais produtos deseja gerar — cada um consome
                  creditos do seu plano.
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
          type="button"
          variant="outline"
          onClick={() => update({ step: state.step - 1 })}
          disabled={state.step === 0}
        >
          Voltar
        </Button>

        {state.step < STEPS.length - 1 ? (
          <Button
            type="button"
            onClick={() => update({ step: state.step + 1 })}
            disabled={!canNext()}
          >
            Proximo
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              state.submitting || !state.inputType || !state.fileUrl
            }
          >
            {state.submitting ? "Processando..." : "Iniciar Processamento"}
          </Button>
        )}
      </div>
    </div>
  );
}
