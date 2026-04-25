/**
 * API composition — monta o auth chain + todas as rotas HTTP públicas do
 * role api em uma instância Express.
 *
 * Este arquivo só CONHECE as rotas — não bootstrapa orchestrator nem
 * injeta dependências de Supabase. Essas etapas continuam no index.ts
 * porque dependem do bootstrap completo (criação de orchestrator, leitura
 * de envs, registro de módulos).
 *
 * Em modo "all", index.ts chama mountApiRoutes(app, prefix) e depois
 * mountWorkerRoutes / mountRendererRoutes — todas convivem.
 */

import type { Express, Request, RequestHandler } from 'express';

// Routes
import processRoutes from '../../api/routes/process.js';
import jobsRoutes from '../../api/routes/jobs.js';
import uploadsRoutes from '../../api/routes/uploads.js';
import billingFirestoreRoutes from '../../api/routes/billing-firestore.js';
import tenantsFirestoreRoutes from '../../api/routes/tenants-firestore.js';
import pipelineEventsRoutes from '../../api/routes/pipeline-events.js';
import approvalRoutes from '../../api/routes/approval.js';
import reviewRoutes from '../../api/routes/reviews.js';
import revisionRoutes from '../../api/routes/revisions.js';
import leadsRoutes from '../../api/routes/leads.js';
import opsRoutes from '../../api/routes/ops.js';
import experimentRoutes from '../../api/routes/experiments.js';
import billingRoutes from '../../api/routes/billing.js';
import webhooksRoutes from '../../api/routes/webhooks.js';
import adminRoutes from '../../api/routes/admin.js';
import analyticsRoutes from '../../api/routes/analytics.js';
import insightsRoutes from '../../api/routes/insights.js';
import templateRoutes from '../../api/routes/templates.js';
import strategyRoutes from '../../api/routes/strategy.js';
import campaignRoutes from '../../api/routes/campaigns.js';
import scheduleRoutes, { calendarRouter } from '../../api/routes/schedule.js';
import executionRoutes from '../../api/routes/execution.js';
import governanceRoutes from '../../api/routes/governance.js';
import optimizationRoutes from '../../api/routes/optimization.js';
import goalRoutes from '../../api/routes/goals.js';
import memoryRoutes from '../../api/routes/memory.js';
import recoveryRoutes from '../../api/routes/recovery.js';
import knowledgeGraphRoutes from '../../api/routes/knowledge-graph.js';
import simulationRoutes from '../../api/routes/simulation.js';
import decisionRoutes from '../../api/routes/decisions.js';
import copilotRoutes from '../../api/routes/copilot.js';
import explainabilityRoutes from '../../api/routes/explainability.js';
import metaOptimizationRoutes from '../../api/routes/meta-optimization.js';
import tenantRoutes, { planRouter as planRoutes } from '../../api/routes/tenants.js';
import funnelRoutes from '../../api/routes/funnel.js';
import publicApiRoutes from '../../api/routes/public-api.js';
import partnerRoutes from '../../api/routes/partners.js';
import acquisitionRoutes from '../../api/routes/acquisition.js';
import integrationHubRoutes from '../../api/routes/integration-hub.js';
import distributionRoutes from '../../api/routes/distribution.js';
import customerDashboardRoutes from '../../api/routes/customer-dashboard.js';
import videoRoutes from '../../api/routes/video.js';
import bugsRoutes from '../../api/routes/bugs.js';

// Middleware
import { firebaseAuthMiddleware } from '../../api/middleware/firebase-auth.js';
import { autoProvisionMiddleware } from '../../api/middleware/auto-provision.js';
import { tenantGuard } from '../../api/middleware/tenant-guard.js';

/**
 * Lista de prefixos que sinalizam request "de API" — quando nenhum prefixo
 * casa, a request é tratada como asset/rota do Next.js (handler nesta lista
 * pula a auth chain Firebase pra não interferir com SSR público).
 *
 * Inclui /tasks e /internal porque, em modo "all", esses paths são montados
 * pelas compositions de worker/renderer e não devem ir pro Next handler.
 * O firebaseAuthMiddleware é permissivo (sem token → next()) e o cloudTasksAuth
 * dentro dos sub-routers valida OIDC depois.
 */
export const API_PATHS = [
  '/api',
  '/internal',
  '/tasks',
  '/webhooks',
  '/generate-video',
  '/health',
];

export function isApiRequest(req: Request): boolean {
  return API_PATHS.some((p) => req.path === p || req.path.startsWith(`${p}/`));
}

const apiOnly = (mw: RequestHandler): RequestHandler =>
  (req, res, next) => (isApiRequest(req) ? mw(req, res, next) : next());

/**
 * Monta auth chain (firebase + auto-provision + tenant guard) + todas as
 * rotas HTTP do role api.
 *
 * IMPORTANTE: este function só registra rotas — depende de o caller já ter
 * injetado Supabase clients nos controllers (`setSupabaseClientForX`) antes
 * de chamar. O index.ts faz isso no bootstrap, antes de montar.
 */
export function mountApiRoutes(app: Express, prefix: string): void {
  // Auth chain — apiOnly evita rodar em assets do Next
  app.use(apiOnly(firebaseAuthMiddleware));
  app.use(apiOnly(autoProvisionMiddleware));
  app.use(apiOnly(tenantGuard));

  // API v1 routes
  app.use(`${prefix}/process`, processRoutes);
  app.use(`${prefix}/uploads`, uploadsRoutes);
  app.use(`${prefix}/billing-fs`, billingFirestoreRoutes);
  app.use(`${prefix}/tenants-fs`, tenantsFirestoreRoutes);
  app.use(`${prefix}/jobs`, jobsRoutes);
  app.use(`${prefix}/jobs`, pipelineEventsRoutes);
  app.use(`${prefix}/jobs`, approvalRoutes);
  app.use(`${prefix}/jobs`, reviewRoutes);
  app.use(`${prefix}/jobs`, revisionRoutes);
  app.use(`${prefix}/leads`, leadsRoutes);
  app.use(`${prefix}/ops`, opsRoutes);
  app.use(`${prefix}/experiments`, experimentRoutes);
  app.use(`${prefix}/billing`, billingRoutes);
  app.use(`${prefix}/admin`, adminRoutes);
  app.use(`${prefix}/analytics`, analyticsRoutes);
  app.use(`${prefix}/insights`, insightsRoutes);
  app.use(`${prefix}/templates`, templateRoutes);
  app.use(`${prefix}/strategy`, strategyRoutes);
  app.use(`${prefix}/campaigns`, campaignRoutes);
  app.use(`${prefix}/campaigns`, scheduleRoutes);
  app.use(`${prefix}/calendar`, calendarRouter);
  app.use(`${prefix}/campaigns`, executionRoutes);
  app.use(`${prefix}/governance`, governanceRoutes);
  app.use(`${prefix}/campaigns`, optimizationRoutes);
  app.use(`${prefix}/goals`, goalRoutes);
  app.use(`${prefix}/memory`, memoryRoutes);
  app.use(`${prefix}/recovery`, recoveryRoutes);
  app.use(`${prefix}/knowledge-graph`, knowledgeGraphRoutes);
  app.use(`${prefix}/simulation`, simulationRoutes);
  app.use(`${prefix}/decisions`, decisionRoutes);
  app.use(`${prefix}/copilot`, copilotRoutes);
  app.use(`${prefix}/explainability`, explainabilityRoutes);
  app.use(`${prefix}/optimization/meta`, metaOptimizationRoutes);
  app.use(`${prefix}/tenants`, tenantRoutes);
  app.use(`${prefix}/plans`, planRoutes);
  app.use(`${prefix}/funnel`, funnelRoutes);
  app.use(`${prefix}/dashboard`, customerDashboardRoutes);
  app.use(`${prefix}/partners`, partnerRoutes);
  app.use(`${prefix}/acquisition`, acquisitionRoutes);
  app.use(`${prefix}/integrations`, integrationHubRoutes);
  app.use(`${prefix}/distribution`, distributionRoutes);
  app.use(`${prefix}/bugs`, bugsRoutes);

  // Webhooks externos (Kiwify, Hotmart) — sem tenant guard
  app.use('/webhooks', webhooksRoutes);

  // Video Generation
  app.use('/generate-video', videoRoutes);

  // Public API (separate prefix, API key auth)
  app.use('/api/public/v1', publicApiRoutes);
}
