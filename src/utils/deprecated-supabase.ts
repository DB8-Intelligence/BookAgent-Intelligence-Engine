/**
 * Deprecated Supabase call logger — Sprint 3.7
 *
 * Supabase foi decommissionado em runtime (Sprint 3.7). Este helper emite
 * um log estruturado quando código antigo ainda tenta acessar Supabase.
 *
 * Uso típico:
 *   if (!supabase) {
 *     logDeprecatedSupabaseCall({ module: 'BugsRoute', action: 'POST /bugs' });
 *     return sendError(res, 'SUPABASE_DEPRECATED', '...', 503);
 *   }
 *
 * O formato é compatível com Cloud Logging — `console.warn` com objeto
 * vira `jsonPayload.module/action/reason` queryável.
 */

export interface DeprecatedSupabaseCallContext {
  /** Módulo que chamou (ex: 'BugsRoute', 'PlanGuard') */
  module: string;
  /** Operação tentada (ex: 'POST /bugs', 'select bookagent_job_meta') */
  action: string;
  /** Razão custom; default: mensagem padrão */
  reason?: string;
}

const DEFAULT_REASON =
  'Supabase has been decommissioned in Sprint 3.7. ' +
  'This call should not happen in Firestore-only runtime — ' +
  'replace with Firestore equivalent or remove the call site.';

export function logDeprecatedSupabaseCall(ctx: DeprecatedSupabaseCallContext): void {
  console.warn('[deprecated-supabase-call]', {
    module: ctx.module,
    action: ctx.action,
    reason: ctx.reason ?? DEFAULT_REASON,
  });
}
