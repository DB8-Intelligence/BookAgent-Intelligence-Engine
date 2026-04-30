/**
 * Worker entrypoint — para o futuro deploy split como bookagent-worker no Cloud Run.
 *
 * NÃO USADO ATUALMENTE. Ver comentário em src/entrypoints/api.ts.
 *
 * Comportamento: força SERVICE_ROLE=worker. Em modo "worker", index.ts:
 *   - NÃO monta auth chain Firebase nem rotas HTTP públicas
 *   - NÃO inicializa Next.js
 *   - Monta APENAS /tasks/{pipeline,editorial,publication,cleanup} e
 *     /internal/execute-pipeline (alias deprecated) com cloudTasksAuth
 *
 * O serviço só recebe POST de Cloud Tasks com OIDC token — não exposto
 * publicamente quando deploy splittar.
 */

process.env.SERVICE_ROLE = process.env.SERVICE_ROLE ?? 'worker';
await import('../index.js');
