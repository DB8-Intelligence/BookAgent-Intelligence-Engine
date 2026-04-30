/**
 * Visual Fidelity Validator
 *
 * Função pura que inspeciona um `RenderSpec` (ver `src/types/render-spec.ts`)
 * contra um catálogo de `Asset[]` e, opcionalmente, `RenderTransformManifest[]`,
 * e reporta violações das regras definidas em `docs/VISUAL_FIDELITY_PRINCIPLES.md`.
 *
 * Design principles:
 *  - Pura: sem I/O, sem mutação de argumentos, sem throw em caminho feliz.
 *  - Não-destrutiva: retorna `FidelityReport` descritivo; a decisão de
 *    bloquear render é de quem consome este output.
 *  - Minimalista: foca nas 7 regras verificáveis estaticamente.
 *  - Integração opt-in: ninguém chama o validator automaticamente. Quem
 *    quiser endurecer o pipeline chama explicitamente — por exemplo,
 *    concatenando `report.violations` em `ExportArtifact.warnings[]`
 *    dentro de `media-exporter.ts`.
 */

import type { RenderSpec, RenderSceneSpec } from '../types/render-spec.js';
import type { Asset } from '../domain/entities/asset.js';
import {
  ALLOWED_ASSET_ORIGINS,
  type FidelityReport,
  type FidelityViolation,
  type RenderTransformManifest,
} from '../domain/entities/visual-fidelity.js';

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export interface FidelityInputs {
  /** Spec produzido pelo `media-exporter`, já parsado. */
  readonly spec: RenderSpec;
  /** Catálogo de assets do job, tipicamente `ProcessingContext.assets`. */
  readonly assets: readonly Asset[];
  /**
   * Declarações pré-render opcionais. Se ausentes, o validator aplica
   * apenas as regras que dependem apenas de `spec` + `assets`.
   */
  readonly manifests?: readonly RenderTransformManifest[];
}

/**
 * Retorna um `FidelityReport` com `passed=false` se houver qualquer
 * violação com severity `error`. Warnings não afetam `passed`.
 */
export function validateRenderSpecFidelity(input: FidelityInputs): FidelityReport {
  const violations: FidelityViolation[] = [];
  const warnings: FidelityViolation[] = [];

  const assetIndex = indexAssets(input.assets);
  const manifestByScene = indexManifests(input.manifests);

  for (const scene of input.spec.scenes) {
    checkSceneAssetIds(scene, assetIndex, violations, warnings);
    checkSceneCompositionHint(scene, violations);
    checkSceneManifests(scene, manifestByScene.get(scene.order) ?? [], violations);
  }

  checkArtifactLevelTraceability(input.spec, assetIndex, warnings);

  const hasError = violations.some((v) => v.severity === 'error');

  return {
    passed: !hasError,
    violations,
    warnings,
    checkedScenes: input.spec.scenes.length,
    checkedAssets: input.assets.length,
  };
}

// ----------------------------------------------------------------------------
// Internal checks
// ----------------------------------------------------------------------------

type AssetIndex = ReadonlyMap<string, Asset>;

function indexAssets(assets: readonly Asset[]): AssetIndex {
  const map = new Map<string, Asset>();
  for (const a of assets) map.set(a.id, a);
  return map;
}

function indexManifests(
  manifests: readonly RenderTransformManifest[] | undefined,
): ReadonlyMap<number, RenderTransformManifest[]> {
  const map = new Map<number, RenderTransformManifest[]>();
  if (!manifests) return map;
  for (const m of manifests) {
    const bucket = map.get(m.sceneOrder);
    if (bucket) {
      bucket.push(m);
    } else {
      map.set(m.sceneOrder, [m]);
    }
  }
  return map;
}

/**
 * Regra: toda cena com visual declarado deve referenciar assets reais,
 * marcados como originais, com origem permitida.
 */
function checkSceneAssetIds(
  scene: RenderSceneSpec,
  assetIndex: AssetIndex,
  violations: FidelityViolation[],
  warnings: FidelityViolation[],
): void {
  const ids = scene.assetIds ?? [];
  const hasVisualOverlay = scene.textOverlays.length > 0 || scene.compositionHint.hasTextOverlay;

  if (ids.length === 0) {
    // Scenes sem assetIds são aceitáveis apenas quando o compositionHint
    // explicita que são color-clip fallbacks (layerCount === 1 e sem
    // overlays de branding/visual). Do contrário, é um broken scene.
    if (scene.compositionHint.layerCount > 1 || scene.compositionHint.hasVisualEffect) {
      violations.push({
        rule: 'empty_asset_ids',
        severity: 'error',
        sceneOrder: scene.order,
        message:
          `Scene ${scene.order} (${scene.role}) declares layers/effects but has no assetIds — ` +
          'broken traceability to source document',
      });
    } else if (hasVisualOverlay) {
      warnings.push({
        rule: 'empty_asset_ids',
        severity: 'warning',
        sceneOrder: scene.order,
        message:
          `Scene ${scene.order} has text overlays on a color-only fallback clip — ` +
          'overlay will render on solid background',
      });
    }
    return;
  }

  for (const id of ids) {
    const asset = assetIndex.get(id);
    if (!asset) {
      violations.push({
        rule: 'missing_asset',
        severity: 'error',
        sceneOrder: scene.order,
        assetId: id,
        message:
          `Scene ${scene.order} references assetId "${id}" which is not in the ` +
          'job asset catalog',
      });
      continue;
    }
    if (asset.isOriginal !== true) {
      violations.push({
        rule: 'non_original_asset',
        severity: 'error',
        sceneOrder: scene.order,
        assetId: id,
        message:
          `Scene ${scene.order} references assetId "${id}" which does not carry ` +
          'isOriginal=true — possible synthetic/derived asset',
      });
    }
    if (!ALLOWED_ASSET_ORIGINS.includes(asset.origin)) {
      violations.push({
        rule: 'forbidden_origin',
        severity: 'error',
        sceneOrder: scene.order,
        assetId: id,
        message:
          `Scene ${scene.order} references assetId "${id}" with disallowed origin ` +
          `"${asset.origin}"`,
      });
    }
  }
}

/**
 * Regra: se uma cena declara text overlays, o `compositionHint` deve
 * registrar a camada correspondente — isso garante que nenhum overlay
 * está sendo rasterizado destrutivamente no asset base.
 */
function checkSceneCompositionHint(
  scene: RenderSceneSpec,
  violations: FidelityViolation[],
): void {
  const declaredOverlays = scene.textOverlays.length;
  if (declaredOverlays > 0 && !scene.compositionHint.hasTextOverlay) {
    violations.push({
      rule: 'overlay_without_layer',
      severity: 'error',
      sceneOrder: scene.order,
      message:
        `Scene ${scene.order} has ${declaredOverlays} text overlays but ` +
        'compositionHint.hasTextOverlay is false — overlay layer missing',
    });
  }

  if (scene.compositionHint.baseAssetReadOnly !== true) {
    violations.push({
      rule: 'overlay_without_layer',
      severity: 'error',
      sceneOrder: scene.order,
      message:
        `Scene ${scene.order} has baseAssetReadOnly=false — base asset may be ` +
        'mutated, violating immutability invariant',
    });
  }

  const minExpectedLayers = 1 + (declaredOverlays > 0 ? 1 : 0) +
    (scene.compositionHint.hasBrandingOverlay ? 1 : 0);
  if (scene.compositionHint.layerCount < minExpectedLayers) {
    violations.push({
      rule: 'overlay_without_layer',
      severity: 'error',
      sceneOrder: scene.order,
      message:
        `Scene ${scene.order} declares layerCount=${scene.compositionHint.layerCount} ` +
        `but expected at least ${minExpectedLayers} given overlays present`,
    });
  }
}

/**
 * Regra: se manifests foram fornecidos, todos os assets da cena devem
 * ter um manifest, e os manifests devem respeitar `preservesAspectRatio`
 * e `maxCropRatio <= 0.15`.
 */
function checkSceneManifests(
  scene: RenderSceneSpec,
  manifests: readonly RenderTransformManifest[],
  violations: FidelityViolation[],
): void {
  if (manifests.length === 0) return;

  const manifestAssetIds = new Set(manifests.map((m) => m.assetId));
  for (const assetId of scene.assetIds) {
    if (!manifestAssetIds.has(assetId)) {
      violations.push({
        rule: 'manifest_violation',
        severity: 'error',
        sceneOrder: scene.order,
        assetId,
        message:
          `Scene ${scene.order}: asset "${assetId}" is used but has no ` +
          'RenderTransformManifest entry',
      });
    }
  }

  for (const m of manifests) {
    // preservesAspectRatio é literal `true` no tipo — checagem runtime
    // protege contra JSON externo malformado.
    if ((m.preservesAspectRatio as boolean) !== true) {
      violations.push({
        rule: 'aspect_mismatch',
        severity: 'error',
        sceneOrder: scene.order,
        assetId: m.assetId,
        message:
          `Manifest for scene ${scene.order} / asset "${m.assetId}" has ` +
          'preservesAspectRatio=false — non-uniform scale not allowed',
      });
    }
    if (m.maxCropRatio < 0 || m.maxCropRatio > 0.15) {
      violations.push({
        rule: 'aspect_mismatch',
        severity: 'error',
        sceneOrder: scene.order,
        assetId: m.assetId,
        message:
          `Manifest for scene ${scene.order} / asset "${m.assetId}" has ` +
          `maxCropRatio=${m.maxCropRatio} — must be between 0 and 0.15`,
      });
    }
    if ((m.baseAssetReadOnly as boolean) !== true) {
      violations.push({
        rule: 'manifest_violation',
        severity: 'error',
        sceneOrder: scene.order,
        assetId: m.assetId,
        message:
          `Manifest for scene ${scene.order} / asset "${m.assetId}" has ` +
          'baseAssetReadOnly=false — base asset must remain immutable',
      });
    }
  }
}

/**
 * Regra artifact-level: nenhum asset usado em alguma cena pode estar
 * ausente do catálogo. Esta checagem é redundante com `missing_asset`
 * por cena mas gera um warning agregado útil para logs.
 */
function checkArtifactLevelTraceability(
  spec: RenderSpec,
  assetIndex: AssetIndex,
  warnings: FidelityViolation[],
): void {
  const usedIds = new Set<string>();
  for (const scene of spec.scenes) {
    for (const id of scene.assetIds) usedIds.add(id);
  }
  const missing: string[] = [];
  for (const id of usedIds) {
    if (!assetIndex.has(id)) missing.push(id);
  }
  if (missing.length > 0) {
    warnings.push({
      rule: 'broken_traceability',
      severity: 'warning',
      message:
        `RenderSpec references ${missing.length} asset ID(s) not present ` +
        `in the job catalog: [${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', ...' : ''}]`,
    });
  }
}

// ----------------------------------------------------------------------------
// Helper para integração opt-in: formata violações como strings para
// colar no `ExportArtifact.warnings[]` do `media-exporter`.
// ----------------------------------------------------------------------------

export function formatFidelityReportAsWarnings(report: FidelityReport): string[] {
  const out: string[] = [];
  for (const v of report.violations) {
    out.push(`[fidelity:${v.rule}] ${v.message}`);
  }
  for (const w of report.warnings) {
    out.push(`[fidelity-warn:${w.rule}] ${w.message}`);
  }
  return out;
}
