/**
 * API entrypoint — para o futuro deploy split como bookagent-api no Cloud Run.
 *
 * NÃO USADO ATUALMENTE — não há script `npm run` apontando pra cá. O monolito
 * continua entrando por src/index.ts. Este arquivo existe só pra que, quando
 * splittarmos os 3 serviços fisicamente (Sprint 3+), o entrypoint já esteja
 * pronto e o build pipeline saiba qual arquivo invocar (`node dist/entrypoints/api.js`).
 *
 * Comportamento: força SERVICE_ROLE=api e reusa o bootstrap completo do
 * index.ts. Em modo "api", index.ts:
 *   - Monta apenas auth chain + rotas API + webhooks + Next.js
 *   - NÃO monta /tasks/* nem /internal/*
 *
 * Versão "lean" (que pula o registro de pipeline modules e inicialização
 * de orchestrator) será implementada em sprint dedicado ao deploy split.
 */

process.env.SERVICE_ROLE = process.env.SERVICE_ROLE ?? 'api';
await import('../index.js');
