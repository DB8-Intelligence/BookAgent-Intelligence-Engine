/**
 * Worker handlers — re-export dos task-handlers que rodam no role worker.
 *
 * O worker é responsável por:
 *   - pipeline (17 estágios de geração de conteúdo)
 *   - editorial (book-editorial bounded context, phase 1)
 *   - publication (n8n webhook + redes sociais)
 *   - cleanup (framework only por enquanto)
 *
 * Os handlers em si vivem em src/queue/task-handlers.ts — este arquivo
 * só formaliza o ownership e expõe-os pelo barrel do worker.
 */

export {
  handlePipelineTask,
  handleEditorialTask,
  handlePublicationTask,
  handleCleanupTask,
  type TaskHandlerDeps,
} from '../../queue/task-handlers.js';
