/**
 * Renderer handlers — re-export do handler de vídeo.
 *
 * O renderer é responsável apenas por geração de vídeo: FFmpeg, thumbnails,
 * áudio, assets finais. Isolá-lo permite (no deploy futuro) usar um container
 * com binário FFmpeg dedicado e perfil de CPU/memória mais alto, sem inflar
 * a imagem dos serviços api/worker.
 */

export {
  handleVideoTask,
  type TaskHandlerDeps,
} from '../../queue/task-handlers.js';
