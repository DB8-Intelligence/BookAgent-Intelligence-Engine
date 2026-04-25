# Visual Pipeline — Technical Audit (DEV-11)

> Auditoria técnica do pipeline visual do BookAgent/BookReel: extração →
> correlação → composição → render → export. Foco em **preservação de
> fidelidade visual** e **rastreabilidade ponta a ponta** dos assets
> originais do PDF/folder, sem qualquer geração sintética.

**Data:** 2026-04-15
**Escopo:** apenas pipeline visual (não editorial).
**Princípio orientador:** nenhum pixel pode aparecer no output sem ser
rastreável até um asset extraído do material original.

---

## 1. Visão geral do fluxo real

```
 PDF/folder
   │
   ▼
 src/adapters/pdf/poppler.ts
   │  (extractImages | renderPage | extractSvg)
   ▼
 src/modules/asset-extraction/
   │  service.ts → extractor.ts
   │  strategies: embedded-extraction | page-render | hybrid | manual-review
   │  paralelo: extractPageFormats() → PNG 300dpi + SVG para cada página
   │  → storage: local (storage/assets/{jobId}/...) + Supabase Storage (CDN)
   │  → Asset[] com { id, filePath, page, origin, hash, isOriginal: true }
   ▼
 src/modules/correlation/
   │  page-correlator.ts → correlateByPage (heurística de proximidade de página)
   │  text-block-parser.ts → classifica HEADLINE / BULLET / CTA / CAPTION
   │  → CorrelationBlock[] com assetIds[] e confidence
   ▼
 src/modules/source-intelligence/
   │  buildSources → mergeSimilarSources → rankSources
   │  → Source[] com assetIds[] (rastreabilidade mantida)
   ▼
 src/modules/narrative/ + src/modules/output-selection/
   │  (fora do escopo desta auditoria, mas produz NarrativeBeat[] e OutputDecision[])
   ▼
 src/modules/media/
   │  media-plan-builder.ts → MediaPlan[] por output decision
   │  scene-composer.ts → MediaScene[] com assetIds[] + textOverlays + layoutHint
   │  LayoutHint: FULL_BLEED | SPLIT_H | SPLIT_V | GRID | OVERLAY | TEXT_CENTERED
   ▼
 src/modules/render-export/
   │  media-exporter.ts → buildRenderSpec() → JSON artifact
   │  ExportArtifact { content: RenderSpec JSON, referencedAssetIds[], status, warnings }
   ▼
 src/renderers/video/spec-renderer.ts
   │  renderFromSpec()
   │  ├─ Shotstack configurado? → shotstack-adapter.ts (cloud)
   │  └─ Senão → ffmpeg.ts (local spawn)
   ▼
 Video MP4 (ou assets para post/carousel)
```

---

## 2. Estado de cada camada

### 2.1 Extração (`src/modules/asset-extraction/`)

**Status:** ✅ IMPLEMENTED — produção, multi-estratégia.

- `extractor.ts` (318 loc) — 4 estratégias reais:
  - **embedded-extraction**: usa `pdfAdapter.extractImages()` (poppler-utils via `pdfimages`), extrai imagens nativas com buffer preservado. Sharp apenas lê metadata — não reprocessa pixels.
  - **page-render**: `pdfAdapter.renderPage(filePath, pageNumber, dpi)` com `force_original_aspect_ratio=decrease` — nunca distorce.
  - **hybrid**: embedded + page-render apenas nas páginas sem imagens embedadas.
  - **manual-review**: fallback para embedded com warning.
- `extractPageFormats()` roda **em paralelo** à estratégia principal e sempre gera:
  - PNG 300dpi por página → Supabase Storage `{jobId}/pages/png/page-{n}.png`
  - SVG por página (se pdftocairo disponível) → `{jobId}/pages/svg/page-{n}.svg`
- Cada `Asset` ganha:
  - `id` (UUID), `filePath` (readonly), `thumbnailPath` (300×300 lossy-preview)
  - `dimensions`, `page`, `format`, `sizeBytes`
  - `hash` SHA-256
  - `origin: PDF_EXTRACTED | PAGE_RENDER`
  - **`isOriginal: true`** — flag de imutabilidade explícito

**Thumbnails são marcadamente de preview:** 300×300 com `fit:inside`, quality 80. Nunca substituem o asset original no render.

### 2.2 Correlação (`src/modules/correlation/`)

**Status:** ✅ IMPLEMENTED — heurística de proximidade de página.

- `correlateByPage()` agrupa assets e blocos de texto pela mesma página. Níveis de confiança: `HIGH` (texto + asset na mesma página), `MEDIUM` (só texto), `LOW` (asset órfão com texto em página adjacente), `INFERRED` (sem match).
- `text-block-parser.ts` classifica blocos: HEADLINE, BULLET_LIST, CTA, CAPTION, PARAGRAPH — usando heurísticas (uppercase ratio, bullet markers, keywords pt-BR).
- **Sem OCR, sem LLM, sem matching espacial em v1.** O campo `Asset.position` (bounding box) é extraído mas **não** é usado nesta etapa — é uma oportunidade clara de P1.

**Rastreabilidade:** cada `CorrelationBlock` carrega `assetIds[]` apontando para `Asset.id`. Nenhuma cópia de pixels, apenas referências.

### 2.3 Source intelligence (`src/modules/source-intelligence/`)

**Status:** ✅ IMPLEMENTED — ranker + merger heurístico.

- Converte `CorrelationBlock[]` → `Source[]`, preservando `assetIds[]`.
- Ranking por: contagem de assets, qualidade do texto, peso estratégico do tipo (hero/CTA/differentiator), confiança da correlação.
- `Source` é o **contrato de rastreabilidade** que atravessa narrative → output-selection → media-plan.

### 2.4 Composição (`src/modules/media/`)

**Status:** ✅ IMPLEMENTED — layout-hint driven.

- `scene-composer.ts` monta `MediaScene[]` a partir de `NarrativeBeat[]`:
  - Resolve `assetIds` filtrando contra `assetMap` (rejeita IDs inválidos)
  - Monta `textOverlays[]` (headline/body/cta com position top/center/bottom)
  - Escolhe `LayoutHint`: `FULL_BLEED | SPLIT_HORIZONTAL | SPLIT_VERTICAL | GRID | OVERLAY | TEXT_CENTERED | MINIMAL | CARD_BLOCK`
  - Nenhum layout implica crop destrutivo — são **hints** que o renderer implementa respeitando aspect ratio.
- `BrandingInstruction` carrega cores/logo, **não substitui** conteúdo visual.
- **Asset imutabilidade** é protegida explicitamente: `compositionHint.baseAssetReadOnly = true`.

### 2.5 Render-export (`src/modules/render-export/`)

**Status:** ✅ IMPLEMENTED — produz JSON spec + metadata.

- `media-exporter.ts` gera `ExportArtifact[]` com:
  - `artifactType: MEDIA_RENDER_SPEC` → `content: JSON string` contendo scenes com `assetIds[]`, `textOverlays[]`, `branding`, `narration`, `compositionHint`
  - `artifactType: MEDIA_METADATA` → caption, hashtags, etc.
  - `referencedAssetIds[]` — **união de todos os assetIds usados no spec**, verificável em tempo linear.
- Status do artifact: `VALID | PARTIAL | INVALID` baseado em `MediaPlan.renderStatus` (READY/NEEDS_ASSETS/NEEDS_TEXT/NOT_READY).
- Warnings são acumulados na lista `warnings[]` — canal natural para validações de fidelidade (ver DEV-12).

### 2.6 Renderers

#### `src/renderers/video/ffmpeg.ts` (472 loc)
**Status:** ✅ IMPLEMENTED — production-ready.

- `buildImageToClipArgs()` — loop image → scale+pad → overlays
- **Filtro crítico:** `scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:{bg}`
  → **nunca distorce**; sempre encaixa preservando proporção + letterbox
- `buildConcatArgs()` concat demuxer (cut sem re-encode)
- `buildXfadeArgs()` para dissolves
- `buildAudioMixArgs()` com ducking por dB (Parte 62 — music engine)
- `buildSubtitleBurnInArgs()` com escape seguro (`escapeFFmpegText`)
- `runFFmpeg(args, timeout)` — `spawn('ffmpeg', ...)` real, com captura de stderr e timeout configurável

#### `src/renderers/video/shotstack-adapter.ts` (431 loc)
**Status:** ✅ IMPLEMENTED — cloud API wrapper.

- Só aceita **URLs públicas** (assets locais são rejeitados com warning — prevenção anti-leak)
- `buildShotstackEdit()` constrói timeline JSON com tracks de imagem/texto/narração
- `submitRender()` → POST `/edit/{env}/render`
- `pollRender()` — poll a cada 4s, max ~5min
- **Ken Burns:** hardcoded `effect: 'zoomIn'` — gap de P1
- Retorna `outputPath` = URL do CDN Shotstack (traceável, público)

#### `src/renderers/video/spec-renderer.ts` (250+ loc)
**Status:** ✅ IMPLEMENTED — orquestrador.

- `renderFromSpec()`:
  1. Detecta Shotstack configurado → delega
  2. Senão verifica FFmpeg disponível → falha se ausente
  3. Para cada scene: `renderSceneFromSpec()` produz clip file
  4. `assembleClips()` concatena em vídeo único
  5. Mistura áudio (música + narração) se configurado
  6. Burn-in de subtítulos se spec especifica
- Timeouts: 5min global, 60s por scene — previne hang
- **Não é stub.** `runFFmpeg` e `pollRender` aguardam processo real.

#### `src/renderers/media-storyboard-renderer.ts` (521 loc)
**Status:** ⚠️ VISUALIZAÇÃO APENAS (não render).

- Gera HTML interativo de storyboard para revisão humana.
- Não participa do render de produção — é ferramenta de preview.
- Placeholders `{{asset:id}}` para mostrar onde cada asset apareceria.

---

## 3. Contratos de tipos existentes

### `Asset` (src/domain/entities/asset.ts)
```typescript
interface Asset {
  readonly id: string;
  readonly filePath: string;         // IMMUTABLE
  readonly thumbnailPath?: string;    // 300×300 preview, lossy OK
  readonly dimensions: Dimensions;    // { width, height }
  readonly page: number;              // página de origem no PDF
  readonly position?: Position;       // bounding box (extraído mas NÃO usado em v1)
  readonly format: string;            // png | jpg | webp
  readonly sizeBytes: number;
  classification?: SourceType;
  readonly origin: AssetOrigin;       // PDF_EXTRACTED | PAGE_RENDER
  readonly hash?: string;             // SHA-256 para dedup
  correlationIds?: string[];
  readonly isOriginal: true;          // ← flag de imutabilidade
}
```

### `CorrelationBlock`
Carrega `assetIds[]`, `textBlocks[]`, `confidence`, `methods[]`. **Traceable**.

### `Source`
Carrega `assetIds[]`, `confidenceScore`, `priority`. **Traceable**.

### `MediaScene`
```typescript
{
  id, order, role,
  assetIds: string[],         // referência direta
  textOverlays: TextOverlay[], // camada separada
  layoutHint: LayoutHint,
  branding: BrandingInstruction,
  durationSeconds, transition
}
```

### `ExportArtifact`
```typescript
{
  ...,
  content: string,                    // JSON do RenderSpec
  referencedAssetIds: string[],       // ← fechamento da cadeia
  status: VALID | PARTIAL | INVALID,
  warnings: string[]
}
```

**A cadeia de rastreabilidade está fechada:**
```
Asset.id → CorrelationBlock.assetIds → Source.assetIds
        → MediaScene.assetIds → RenderSpec.scenes[].assetIds
        → ExportArtifact.referencedAssetIds
```

---

## 4. Riscos críticos — matriz

| # | Risco | Status | Localização | Evidência |
|---|---|---|---|---|
| 1 | **Distorção não-uniforme** | ✅ SAFE | ffmpeg.ts:~97, shotstack:~190 | `force_original_aspect_ratio=decrease` + pad sempre presente |
| 2 | **Geração sintética (inpaint/fill/bg removal)** | ✅ SAFE | todo o codebase | Grep negativo para `DALL-E`, `midjourney`, `flux`, `inpaint`, `outpaint`, `background-removal`, `generative-fill` |
| 3 | **Perda de rastreabilidade** | ✅ SAFE | export-artifact.ts, media-exporter.ts:~431 | `referencedAssetIds[]` obrigatório em todo artifact |
| 4 | **Text/image mixup** | ✅ SAFE | scene-composer.ts, ffmpeg.ts:~415 | textOverlays é camada separada, base asset marcado readonly |
| 5 | **Silent stubs de render** | ✅ SAFE | spec-renderer.ts:~91 | `runFFmpeg` spawn real, exit code checado |
| 6 | **Ken Burns não conectado ao FFmpeg** | ⚠️ PARTIAL | spec-renderer.ts renderSceneFromSpec | `motionProfile` no spec mas FFmpeg não lê — output estático |
| 7 | **Correlação espacial ausente** | ⚠️ PARTIAL | correlation/page-correlator.ts | `Asset.position` extraído mas ignorado |
| 8 | **Validação de fidelidade antes do render** | ❌ ABSENT | — | Nenhum guard checa se RenderSpec respeita regras de fidelidade antes de enviar ao renderer |
| 9 | **Asset com aspecto conflitante com output** | ⚠️ PARTIAL | media-plan-builder.ts | `evaluateRenderStatus` não alerta sobre landscape-only em reel 9:16 |
| 10 | **Logo/texto cobrindo conteúdo-chave** | ⚠️ UNCLEAR | scene-composer.ts | Sem validação de área "segura" — cabe ao LayoutHint, não há guard |
| 11 | **Transições rude entre color clips** | ⚠️ MINOR | spec-renderer.ts assembleClips | Concat demuxer faz cut seco entre fallback clips |
| 12 | **URLs públicas do Shotstack** | ⚠️ PARTIAL | shotstack-adapter.ts:~364 | Depende de RLS correto do bucket — falha graciosamente se mal configurado |

---

## 5. Pontos seguros

O pipeline protege bem contra:

1. **Geração sintética** — zero pontos de entrada para imagens criadas por IA.
2. **Distorção** — o filtro FFmpeg é universal e explícito.
3. **Traceabilidade** — a cadeia de `assetIds` atravessa toda a stack sem rupturas.
4. **Imutabilidade do asset original** — `filePath` readonly, `isOriginal: true`, hash SHA-256.
5. **Escape de text overlays** — `escapeFFmpegText` previne injection em drawtext.
6. **Timeouts** — nenhum processo pode ficar preso > 5min global.

## 6. Gaps reais

### P0 (ship-blocker)

1. **Ausência de validador de fidelidade pré-render** (#8).
   Não há checagem formal de que um `RenderSpec` gerado pelo `media-exporter`
   respeita os princípios: 100% dos `assetIds` existem, scale permitido,
   camadas separadas, nenhum `AssetOrigin` suspeito. **DEV-12 cobre isso.**

2. **Ausência de documento formal de princípios de fidelidade visual**.
   O código é seguro *na prática* por acidente arquitetural, não por contrato
   explícito. Qualquer mudança futura pode quebrar as garantias sem perceber.
   **DEV-12 cobre isso.**

### P1 (alta prioridade)

3. **Ken Burns não conectado ao FFmpeg** (#6) — a `motionProfile` é gerada
   mas ignorada pelo `spec-renderer.ts` no caminho local. Output estático.
4. **Correlação espacial** (#7) — `Asset.position` ignorado; implementar
   matching por overlap espacial dentro de `correlateByPage`.
5. **Readiness check para aspect mismatch** (#9) — alertar quando > 70% dos
   assets do plano são landscape e o output é 9:16 (ou vice-versa).

### P2 (polish)

6. Transições xfade entre color clips fallback (#11).
7. Font/size configurável em subtítulos.
8. HDR 10-bit preservation para imóveis high-end.

---

## 7. Recomendação de melhoria por prioridade

| Prioridade | Ação | Escopo |
|---|---|---|
| **P0** | Definir `docs/VISUAL_FIDELITY_PRINCIPLES.md` como contrato formal | DEV-12 |
| **P0** | Criar `VisualFidelityValidator` puro + tipos de suporte (`RenderTransformManifest`, `SourceDocument`, `DocumentPage`) | DEV-12 |
| **P0** | Integrar validador no `media-exporter.ts` com warnings não-destrutivos | DEV-12 |
| **P1** | Conectar `motionProfile` ao `spec-renderer.ts` (ken burns via zoompan) | futuro |
| **P1** | Implementar correlação espacial em `page-correlator.ts` usando `Asset.position` | futuro |
| **P1** | Readiness check de aspect mismatch no `media-plan-builder.ts` | futuro |
| **P2** | Xfade entre fallback color clips | futuro |
| **P2** | Customização de subtítulos | futuro |

---

## 8. Arquivos lidos (inventário)

| Arquivo | Status |
|---|---|
| `src/modules/asset-extraction/index.ts` | IMPLEMENTED |
| `src/modules/asset-extraction/service.ts` | IMPLEMENTED |
| `src/modules/asset-extraction/extractor.ts` | IMPLEMENTED |
| `src/modules/asset-extraction/types.ts` | IMPLEMENTED |
| `src/modules/correlation/index.ts` | IMPLEMENTED |
| `src/modules/correlation/page-correlator.ts` | IMPLEMENTED |
| `src/modules/correlation/text-block-parser.ts` | IMPLEMENTED |
| `src/modules/source-intelligence/index.ts` | IMPLEMENTED |
| `src/modules/media/index.ts` | IMPLEMENTED |
| `src/modules/media/scene-composer.ts` | IMPLEMENTED |
| `src/modules/media/media-plan-builder.ts` | IMPLEMENTED |
| `src/modules/render-export/index.ts` | IMPLEMENTED |
| `src/modules/render-export/media-exporter.ts` | IMPLEMENTED |
| `src/renderers/media-storyboard-renderer.ts` | PREVIEW-ONLY |
| `src/renderers/video/ffmpeg.ts` | IMPLEMENTED |
| `src/renderers/video/shotstack-adapter.ts` | IMPLEMENTED |
| `src/renderers/video/spec-renderer.ts` | IMPLEMENTED |
| `src/adapters/pdf/poppler.ts` | IMPLEMENTED |
| `src/adapters/storage/supabase.ts` | IMPLEMENTED |
| `src/domain/entities/asset.ts` | IMPLEMENTED |
| `src/domain/entities/export-artifact.ts` | IMPLEMENTED |

---

## 9. Resumo executivo

**O pipeline visual é production-ready para o fluxo
extract → compose → render → export.** As garantias de fidelidade visual
existem *de fato* no código:

- ✅ **Zero geração sintética de imagem**
- ✅ **Zero distorção não-uniforme** (letterbox explícito)
- ✅ **Traceabilidade completa** (`assetIds` atravessa toda a stack)
- ✅ **Imutabilidade do asset original** (`isOriginal: true`)
- ✅ **Renderers reais** (FFmpeg spawn + Shotstack HTTP)

**Mas estas garantias não estão formalizadas:** não há documento de
princípios, não há validador explícito, não há contrato de manifesto de
transformações. Um refactor descuidado pode rompê-las silenciosamente.

**Próximo passo obrigatório (DEV-12):**
1. Formalizar princípios em `docs/VISUAL_FIDELITY_PRINCIPLES.md`.
2. Introduzir tipos de contrato (`RenderTransformManifest`, `SourceDocument`, `DocumentPage`).
3. Criar `VisualFidelityValidator` que recebe um `RenderSpec` + catálogo
   de assets e retorna `FidelityReport` com violações.
4. Integrar como warning-source não-destrutivo no export.
