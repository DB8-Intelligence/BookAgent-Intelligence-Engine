# Visual Fidelity Principles — BookAgent / BookReel

> **Contrato arquitetural.** Este documento define as regras invioláveis
> para o pipeline visual do produto. Qualquer código que toque extração,
> composição ou render de assets visuais deve estar em conformidade.
> Violações devem ser detectadas em tempo de build, runtime, ou — no
> mínimo — em review de código.

**Status:** Normativo (DEV-12).
**Última revisão:** 2026-04-15.
**Escopo:** apenas pipeline visual (imagem → reel / post / vídeo).

---

## Princípio zero

> **Cada pixel no output deve ser rastreável até um asset extraído do
> material original do empreendimento.**

Não há exceção. Nem logo, nem texto sobrescrito, nem Ken Burns, nem
transição, nem música. Se um elemento visual aparece no output, ele é
(a) um asset com `isOriginal: true` vindo de `asset-extraction`, ou
(b) uma camada de **overlay declarativa** (texto, branding, subtítulo),
transparente, identificada e rastreável.

---

## 1. Transformações permitidas

As seguintes transformações preservam fidelidade e estão aprovadas:

| # | Transformação | Onde | Por quê é seguro |
|---|---|---|---|
| 1 | **Scale uniforme (decrease-only)** | FFmpeg `scale=W:H:force_original_aspect_ratio=decrease` | Preserva aspect ratio; apenas reduz |
| 2 | **Padding / letterbox** | FFmpeg `pad=W:H:(ow-iw)/2:(oh-ih)/2:bgcolor` | Adiciona borda; não modifica o asset |
| 3 | **Crop centrado com margem ≤ 15% por eixo** | Futuro | Preserva conteúdo central; descartável com log |
| 4 | **Recompressão lossless** | ffmpeg `-codec copy` | Não toca pixels |
| 5 | **Overlay de texto** | `textOverlays[]` como camada separada | Base asset permanece read-only |
| 6 | **Overlay de logo** | `BrandingInstruction.logoUrl` como camada | Base asset permanece read-only |
| 7 | **Transições entre clipes** | FFmpeg xfade, concat | Não altera pixels do clipe |
| 8 | **Ken Burns (zoom-pan uniforme)** | FFmpeg zoompan, Shotstack zoomIn | Zoom uniforme, sem distorção |
| 9 | **Color grading preservando tonalidade dominante** | Futuro (apenas LUT conservador) | Apenas se rastreável |
| 10 | **Thumbnail 300×300 `fit:inside`** | Extraction | Preview lossy separado do asset original |

**Regra técnica #1:** qualquer scale deve ter `force_original_aspect_ratio=decrease` (ou equivalente `aspect preserving`).

**Regra técnica #2:** qualquer overlay deve viver em camada separada, com o asset base marcado `baseAssetReadOnly: true` no `compositionHint`.

---

## 2. Transformações proibidas

As seguintes operações **nunca** devem ser executadas no pipeline visual:

| # | Transformação | Motivo | Detecção |
|---|---|---|---|
| P1 | **Geração de imagens por IA** (DALL-E, Midjourney, FLUX, SDXL, etc.) | Viola o princípio zero | Grep de imports; validator marca `AssetOrigin` fora do whitelist |
| P2 | **Inpainting / outpainting / generative fill** | Gera pixels sintéticos | Grep por `inpaint`, `outpaint`, `fill` em prompts; proibido em adapters |
| P3 | **Background replacement / segmentation-driven removal** | Descarta conteúdo original | Grep por `remove-bg`, `u2net`, `rembg` |
| P4 | **Super-resolution / ESRGAN / "enhance"** | Inventa detalhes | Grep por `esrgan`, `real-esrgan`, `super-resolution` |
| P5 | **Scale não-uniforme (stretch em X ou Y)** | Distorce proporção | Validator inspeciona `scale` sem `force_original_aspect_ratio` |
| P6 | **Crop > 15% por eixo sem marcação explícita** | Pode cortar conteúdo-chave | Validator compara crop declarado vs aspect do asset |
| P7 | **Overlay destrutivo (text rasterizado no asset base)** | Perde camada | Validator requer `layerCount ≥ 2` quando há text overlay |
| P8 | **Re-encoding lossy duplicado (re-encode + re-encode)** | Acumula artefatos | FFmpeg usa `-codec copy` sempre que possível |
| P9 | **Substituição de asset por placeholder sintético** | Perde traceability | Validator requer `assetIds[]` não vazio para cenas com visual |
| P10 | **Geração de "thumbnails de alta qualidade"** a partir de crops | Mistura base e derivativo | Thumbnails são sempre 300×300 e marcados como preview-only |

Cada violação deve ser detectada pelo `VisualFidelityValidator` (ver seção 7).

---

## 3. Regra de rastreabilidade

> **Todo `ExportArtifact` visual deve carregar uma cadeia completa de
> referências que parta de `Asset.id` e chegue até o artifact final.**

A cadeia canônica:

```
Asset.id
  ↳ CorrelationBlock.assetIds
       ↳ Source.assetIds
            ↳ MediaScene.assetIds
                 ↳ RenderSpec.scenes[].assetIds
                      ↳ ExportArtifact.referencedAssetIds
```

**Regras:**

1. **Nenhuma etapa pode introduzir um `assetId` que não exista** no catálogo
   de assets do job (`ProcessingContext.assets`).
2. **Nenhuma etapa pode descartar um `assetId`** sem gerar um warning ou
   um log de auditoria explícito.
3. **`ExportArtifact.referencedAssetIds` deve ser a união** de todos os
   `assetIds` das cenas do spec subjacente. Deduplicado, sem extras.
4. **Se um artifact não referencia assets**, ele deve ter
   `outputFormat === 'text-only'` ou equivalente documentado — e nesse
   caso não é artifact visual.

---

## 4. Regra de preservação de proporção

> **Nenhum asset pode ser transformado de forma que altere sua aspect
> ratio original de forma não-uniforme.**

**Permitido:**
- `scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:...` (letterbox)
- `scale=W:H:force_original_aspect_ratio=increase,crop=W:H` (centered crop ≤ 15%)
- `zoompan` com `z=zoom+0.001:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2)` (uniforme)

**Proibido:**
- `scale=1080:1920` (sem `force_original_aspect_ratio`)
- `setdar=9/16` após scale (força aspect sem recalcular)
- Crop > 15% por eixo sem log/warning
- `hflip`/`vflip` sem justificativa explícita de design

**O renderer `spec-renderer.ts` atual já obedece.** O papel do validator
(seção 7) é detectar regressões futuras.

---

## 5. Regra de correlação asset ↔ texto ↔ página

> **A cada `textOverlay` em uma cena deve corresponder (a) um texto
> extraído do documento original na mesma área semântica, ou (b) um
> texto de branding pertencente ao cliente.**

Fontes válidas para um `textOverlay`:
- **extracted** — parseado de um `TextBlock` do mesmo `CorrelationBlock`
  que supriu o asset.
- **narrative** — roteiro gerado a partir de `Source.text` (que por sua
  vez é derivado do documento).
- **branding** — texto fixo do cliente (CTA, slogan, etc.) declarado em
  `BrandingInstruction`.

**Proibido:**
- Texto gerado por LLM sem âncora em `Source` / `CorrelationBlock`.
- Texto de um empreendimento sobrescrito em um asset de outro empreendimento.
- Texto que obriga crop do asset para caber.

A **regra de correlação** é persistida em
`RenderTransformManifest.textOverlayOrigin` (ver seção 6): para cada
overlay, o manifest carrega o source (`extracted | narrative | branding`)
e, quando aplicável, o `correlationBlockId` e o `sourceId`.

---

## 6. Regra de composição segura para vídeo

> **O layout da cena deve ser definido por um `LayoutHint` conhecido e
> o `RenderTransformManifest` deve declarar, antes do render, quais
> transformações serão aplicadas a cada asset.**

O manifest é puro metadado (DTO), não executa nada — mas serve como:

- **Contrato de intenção** consumido pelo renderer.
- **Fonte de verdade** para o validator decidir se a composição é segura.
- **Trilha de auditoria** salva junto ao `ExportArtifact` (no campo `warnings` ou em um futuro `transformManifest`).

Shape (definido em `src/domain/entities/visual-fidelity.ts` — ver seção 8):

```ts
interface RenderTransformManifest {
  sceneId: string;
  assetId: string;
  fit: 'letterbox' | 'centered-crop' | 'pad';
  maxCropRatio: number;          // 0.0 — 0.15
  preservesAspectRatio: true;    // SEMPRE true nesta versão
  allowedTransforms: AllowedTransform[];
  textOverlayOrigin: Array<{
    overlayIndex: number;
    origin: 'extracted' | 'narrative' | 'branding';
    correlationBlockId?: string;
    sourceId?: string;
  }>;
  baseAssetReadOnly: true;       // SEMPRE true
}
```

---

## 7. Validação

Ver `src/services/visual-fidelity-validator.ts` (DEV-12).

O validator é **puro** (função, não classe stateful). Recebe:
- um `RenderSpec` parsado
- um catálogo de `Asset[]` do job
- opcionalmente um catálogo de `CorrelationBlock[]` e `Source[]`

Retorna um `FidelityReport`:

```ts
interface FidelityReport {
  passed: boolean;
  violations: FidelityViolation[];
  warnings: FidelityViolation[];
  checkedScenes: number;
  checkedAssets: number;
}

interface FidelityViolation {
  rule: 'missing_asset' | 'non_original_asset' | 'aspect_mismatch'
      | 'empty_asset_ids' | 'overlay_without_layer' | 'forbidden_origin'
      | 'broken_traceability';
  severity: 'error' | 'warning';
  sceneOrder?: number;
  assetId?: string;
  message: string;
}
```

### Pontos de uso

1. **`media-exporter.ts`** — após `buildRenderSpec`, antes de criar o
   `ExportArtifact`, rodar o validator e concatenar `violations` às
   `warnings[]` do artifact. **Não-destrutivo**: um artifact com
   violações continua sendo persistido (com `status: PARTIAL`), mas
   fica auditado.
2. **Teste de unidade** — usar o validator como oracle em testes que
   montam `RenderSpec` sintético.
3. **CLI futuro** — possível comando `bookagent validate-spec file.json`
   para inspeção manual.

### Comportamento não-destrutivo

O validator **não lança, não muta, não rejeita**. Apenas reporta. A
decisão de bloquear o render é da camada que o consome — este design
preserva o princípio de que o pipeline de execução não é mudado.

---

## 8. Tipos adicionados

Os tipos novos vivem em `src/domain/entities/visual-fidelity.ts` e
**estendem** os existentes sem duplicar:

| Tipo | Papel | Relacionamento |
|---|---|---|
| `SourceDocument` | O PDF/folder de entrada como uma unidade rastreável | Um `jobId` → exatamente um `SourceDocument` |
| `DocumentPage` | Página do documento com seu asset principal (page render) e assets embedados | `SourceDocument.pages[]`; referencia `Asset.id` |
| `PageAsset` | Alias semântico de `Asset` quando visto "da perspectiva da página" — **não duplica**; apenas um `type PageAsset = Asset` para clareza |
| `PageTextBlock` | Alias de `TextBlock` (já existe em `src/modules/correlation/text-block-parser.ts`) visto da perspectiva da página |
| `AssetTextCorrelation` | Alias semântico de `CorrelationBlock` — contrato nomeado na linguagem do visual fidelity |
| `RenderTransformManifest` | Declaração pré-render do que será feito com cada asset em cada cena | Gerado pelo exporter, validado pelo validator |
| `AllowedTransform`, `ForbiddenTransform` | Enums explícitos | Usados pelo validator |
| `FidelityReport`, `FidelityViolation` | Output do validator | Não persistido em DB — vive em memória |

Todos os tipos usam `readonly` onde aplicável para reforçar imutabilidade
ao nível de tipo.

---

## 9. O que muda no runtime

**Nada breaking.** DEV-12 apenas:

1. Cria o doc normativo (este arquivo).
2. Adiciona tipos novos em `src/domain/entities/visual-fidelity.ts`.
3. Adiciona validator puro em `src/services/visual-fidelity-validator.ts`.
4. **Não** toca `scene-composer.ts`, `media-exporter.ts`, `ffmpeg.ts`,
   `shotstack-adapter.ts`, `spec-renderer.ts`.

A integração do validator no `media-exporter` é registrada como ponto de
extensão documentado — se for feita, é uma adição de ≤ 5 linhas no
`buildRenderSpecArtifact` que só acumula strings em `warnings[]`.
Retrocompatível, sem mudar nenhum comportamento existente.

---

## 10. Checklist de conformidade

Qualquer PR que toque o pipeline visual deve passar por:

- [ ] Nenhum import novo de bibliotecas de geração de imagem
- [ ] Qualquer scale/resize usa `force_original_aspect_ratio` ou equivalente
- [ ] Qualquer crop é ≤ 15% por eixo ou é rejeitado
- [ ] Qualquer nova camada de composição preserva `baseAssetReadOnly: true`
- [ ] `RenderSpec` gerado passa pelo `VisualFidelityValidator` sem
      violações de severity `error`
- [ ] `ExportArtifact.referencedAssetIds` é a união exata dos assetIds
      usados no spec
- [ ] `textOverlays` têm origem declarada em `RenderTransformManifest`
      quando o manifest estiver em uso
- [ ] `AssetOrigin` permanece em `{PDF_EXTRACTED, PAGE_RENDER, VIDEO_FRAME,
      PPTX_SLIDE, UPLOADED}` — nenhum origin sintético é adicionado

---

## 11. Princípio final

> **É melhor entregar um reel letterbox com um único asset original do
> que um reel visualmente "perfeito" com um pixel inventado.**

Fidelidade > polimento. Sempre.
