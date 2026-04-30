/**
 * Renderer entrypoint — para o futuro deploy split como bookagent-renderer
 * no Cloud Run.
 *
 * NÃO USADO ATUALMENTE. Ver comentário em src/entrypoints/api.ts.
 *
 * Comportamento: força SERVICE_ROLE=renderer. Em modo "renderer", index.ts:
 *   - NÃO monta auth chain Firebase nem rotas HTTP públicas
 *   - NÃO inicializa Next.js
 *   - Monta APENAS /tasks/video e /internal/execute-video-render (alias)
 *     com cloudTasksAuth
 *
 * No deploy split, este container pode usar imagem com FFmpeg dedicada e
 * perfil de CPU/memória maior pra render acelerado.
 */

process.env.SERVICE_ROLE = process.env.SERVICE_ROLE ?? 'renderer';
await import('../index.js');
