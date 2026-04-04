/**
 * Domain Policies — Regras formais do sistema.
 *
 * Políticas são regras invioláveis que governam o comportamento
 * de todos os módulos. Diferente de value objects ou entities,
 * políticas não carregam dados — carregam restrições.
 */

export {
  ASSET_IMMUTABILITY_POLICY,
  assertAssetImmutable,
  validateCompositionLayers,
  isOperationSafe,
  assertOperationAllowed,
  extractReferencedAssetIds,
  type AssetOperation,
} from './asset-immutability.js';
