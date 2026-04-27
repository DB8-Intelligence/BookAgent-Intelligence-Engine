/**
 * Shared /health route — montado em todos os roles (api, worker, renderer).
 *
 * O Cloud Run depende de /health pra startup probe e liveness — todo serviço
 * precisa expor o endpoint. O conteúdo permanece idêntico ao que hoje vive
 * no index.ts; só foi movido pra cá pra que cada entrypoint (incluindo o
 * monolito atual) possa registrá-lo via uma única chamada.
 */

import type { Express } from 'express';
import { checkProviderStatus } from '../../adapters/provider-factory.js';
import { auditSecrets } from '../../utils/secrets.js';

export interface HealthSnapshot {
  persistenceMode: 'firestore-primary' | 'firestore-only' | 'memory';
  queueMode: boolean;
  pipelineModuleCount: number;
  pipelineModuleStages: string[];
  /** Opcional — adiciona 'role' ao payload, útil pra debug em deploys split. */
  role?: string;
}

export function mountHealthRoute(app: Express, snapshot: HealthSnapshot): void {
  app.get('/health', (_req, res) => {
    const providers = checkProviderStatus();

    res.json({
      status: 'ok',
      engine: 'bookagent-intelligence-engine',
      version: '1.0.0',
      uptime: process.uptime(),
      ...(snapshot.role ? { role: snapshot.role } : {}),
      persistence: {
        primary: 'firestore',
        mode: snapshot.persistenceMode,
        firestore: {
          enabled: !!(process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID),
          projectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? null,
        },
        // Sprint 3.8 — Supabase volta como adapter LEGACY via flag
        // LEGACY_SUPABASE_ENABLED. Firestore continua canônico; Supabase
        // atende 17 controllers do Cluster A (billing/admin/analytics/...).
        supabase: {
          enabled: snapshot.persistenceMode === 'firestore-primary',
          mode: snapshot.persistenceMode === 'firestore-primary' ? 'legacy' : 'disabled',
          scope: 'legacy-modules-only',
        },
      },
      queue: {
        mode:     snapshot.queueMode ? 'cloud-tasks-async' : 'sync-inline',
        enabled:  snapshot.queueMode,
        provider: snapshot.queueMode ? 'google-cloud-tasks' : null,
      },
      providers: {
        ai: providers.ai,
        tts: providers.tts,
      },
      socialPublish: {
        metaCredentials: !!process.env.META_ACCESS_TOKEN,
        instagram: !!(process.env.META_ACCESS_TOKEN && process.env.META_INSTAGRAM_ACCOUNT_ID),
        facebook: !!(process.env.META_ACCESS_TOKEN && process.env.META_FACEBOOK_PAGE_ID),
      },
      secrets: auditSecrets(),
      plans: {
        available: ['starter', 'pro', 'agency'],
        enforcement: 'active',
      },
      pipeline: {
        modules: snapshot.pipelineModuleCount,
        stages: snapshot.pipelineModuleStages,
      },
      routes: {
        total: 30,
        prefixes: [
          'process', 'jobs', 'leads', 'ops', 'experiments', 'billing',
          'admin', 'analytics', 'insights', 'templates', 'strategy',
          'campaigns', 'calendar', 'governance', 'goals', 'memory',
          'recovery', 'knowledge-graph', 'simulation', 'decisions',
          'copilot', 'explainability', 'optimization/meta', 'dashboard',
        ],
      },
    });
  });
}
