/**
 * Worker service barrel.
 *
 * Esta camada é puramente de composição: re-exporta os handlers que
 * pertencem logicamente ao worker e a função de mounting que o index.ts
 * (ou o entrypoint dedicado) consome.
 */

export {
  handlePipelineTask,
  handleEditorialTask,
  handlePublicationTask,
  handleCleanupTask,
  type TaskHandlerDeps,
} from './handlers.js';
export { mountWorkerRoutes } from './composition.js';
