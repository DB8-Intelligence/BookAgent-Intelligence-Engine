/**
 * Growth Phase Detector — BookAgent Intelligence Engine
 *
 * Automatically determines the current growth phase based on system metrics:
 *   Phase 1: 0–100 active users    (validation)
 *   Phase 2: 100–1,000 active users (automation & efficiency)
 *   Phase 3: 1,000+ active users   (platform & scale)
 *
 * Used by the ops dashboard to surface phase-specific recommendations.
 *
 * Parte 57: Estratégia de Crescimento Escalável
 */

import type { SupabaseClient } from '../persistence/supabase-client.js';
import { logger } from '../utils/logger.js';

export type GrowthPhase = 1 | 2 | 3;

export interface GrowthPhaseInfo {
  phase: GrowthPhase;
  label: string;
  activeUsers: number;
  /** Monthly Recurring Revenue estimate (BRL centavos) based on plan_overrides */
  estimatedMRR: number;
  recommendations: string[];
  readyForNext: boolean;
  nextPhaseCriteria: string[];
}

interface UserCount { total: string; }
interface RevenueRow { estimated_mrr: string; }

/**
 * Detects the current growth phase and returns actionable insights.
 */
export async function detectGrowthPhase(supabase: SupabaseClient): Promise<GrowthPhaseInfo> {
  let activeUsers = 0;
  let estimatedMRR = 0;

  try {
    // Count distinct users with jobs in the last 30 days
    const rows = await supabase.select<UserCount>('bookagent_monthly_usage', {
      select: 'user_id',
    });
    // Each row is a unique user_id in the view
    activeUsers = rows.length;
  } catch {
    // View may not exist yet — fall back to job_meta count
    try {
      const rows = await supabase.select<{ user_id: string }>('bookagent_job_meta', {
        select: 'user_id',
      });
      const uniqueUsers = new Set(rows.map(r => r.user_id));
      activeUsers = uniqueUsers.size;
    } catch {
      activeUsers = 0;
    }
  }

  try {
    const rows = await supabase.select<RevenueRow>('bookagent_revenue_estimate', {
      select: 'estimated_mrr',
    });
    estimatedMRR = rows.reduce((sum, r) => sum + parseInt(r.estimated_mrr || '0', 10), 0);
  } catch {
    estimatedMRR = 0;
  }

  // Determine phase
  const phase: GrowthPhase = activeUsers >= 1000 ? 3 : activeUsers >= 100 ? 2 : 1;

  return buildPhaseInfo(phase, activeUsers, estimatedMRR);
}

function buildPhaseInfo(
  phase: GrowthPhase,
  activeUsers: number,
  estimatedMRR: number,
): GrowthPhaseInfo {
  switch (phase) {
    case 1:
      return {
        phase: 1,
        label: 'Validação de Mercado',
        activeUsers,
        estimatedMRR,
        recommendations: [
          'Foco em feedback direto de cada usuário',
          'Acompanhar tempo de resposta e satisfação manualmente',
          'Resolver bugs rapidamente — cada usuário conta',
          'Monitorar churn do primeiro mês (meta: < 30%)',
          'Manter Cloud Run min-instances=0 + Firestore Native — custo mínimo',
        ],
        readyForNext: activeUsers >= 50,
        nextPhaseCriteria: [
          '≥ 50 usuários ativos pagantes',
          'Churn < 20% no último mês',
          'Nenhum P0 aberto',
          'Tempo médio de processamento < 8 min',
        ],
      };

    case 2:
      return {
        phase: 2,
        label: 'Automação e Eficiência',
        activeUsers,
        estimatedMRR,
        recommendations: [
          'Migrar rate limiter para Redis-backed (múltiplas instâncias)',
          'Implementar cache de outputs de IA (SHA256 do input)',
          'Usar Gemini para análise + Claude para copy (provider routing por custo)',
          'Escalar worker para QUEUE_CONCURRENCY=4-6',
          'Implementar self-service de cadastro e pagamento',
          'Automatizar FAQ no WhatsApp via n8n',
          'Monitorar margem bruta — meta: > 60%',
        ],
        readyForNext: activeUsers >= 500,
        nextPhaseCriteria: [
          '≥ 500 usuários ativos pagantes',
          'Churn < 8% no último trimestre',
          'Margem bruta sustentada > 60%',
          'Infra operando < 70% da capacidade em pico',
          'Produto reconhecido por ≥ 3 imobiliárias de porte médio',
        ],
      };

    case 3:
      return {
        phase: 3,
        label: 'Plataforma e Escala Real',
        activeUsers,
        estimatedMRR,
        recommendations: [
          'Separar API e Worker em serviços independentes',
          'Adicionar CDN (Cloudflare R2) para artifacts públicos',
          'Implementar Sentry para error tracking em produção',
          'SLA formal para plano Business',
          'Considerar multi-region (SP + RJ)',
          'Monitoramento externo de uptime (meta: > 99.9%)',
          'Expandir nichos (advogados, médicos, coaches)',
        ],
        readyForNext: false, // Phase 3 is the final phase for now
        nextPhaseCriteria: [
          'MRR > R$ 500.000',
          'NRR > 110%',
          'Churn anual < 15%',
        ],
      };
  }
}
