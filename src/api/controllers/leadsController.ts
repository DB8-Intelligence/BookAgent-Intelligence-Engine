/**
 * Leads Controller — BookAgent Intelligence Engine
 *
 * Gerencia o funil comercial: registro de leads, atualização de estágio,
 * log de eventos e controle do trial gratuito.
 *
 * Endpoints:
 *   POST   /api/v1/leads/register        → Registrar novo lead (chamado pelo Fluxo 7)
 *   GET    /api/v1/leads/:phone          → Dados do lead (checagem antes de enviar mensagem)
 *   PATCH  /api/v1/leads/:phone/stage    → Atualizar estágio do lead no funil
 *   POST   /api/v1/leads/:phone/event    → Registrar evento de interação
 *   POST   /api/v1/leads/:phone/demo     → Incrementar demos_used (chamado ao iniciar demo)
 *
 * Parte 56: Funil de Vendas e Operação Comercial
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../helpers/response.js';
import { logger } from '../../utils/logger.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';

// ============================================================================
// Dependency injection
// ============================================================================

let supabase: SupabaseClient | null = null;

export function setLeadsSupabaseClient(client: SupabaseClient): void {
  supabase = client;
}

// ============================================================================
// Types (reflect bookagent_leads schema from migration 005)
// ============================================================================

type LeadStage =
  | 'new'
  | 'demo_sent'
  | 'demo_processing'
  | 'demo_delivered'
  | 'offer_sent'
  | 'converted'
  | 'lost'
  | 'reactivated';

type LeadSource = 'whatsapp' | 'instagram' | 'direct' | 'referral';

type LeadEventType =
  | 'message_received'
  | 'message_sent'
  | 'pdf_received'
  | 'demo_completed'
  | 'offer_sent'
  | 'follow_up_sent'
  | 'converted'
  | 'opted_out'
  | 'reactivated';

interface LeadRow {
  id: string;
  phone: string;
  name: string | null;
  source: LeadSource;
  stage: LeadStage;
  demos_used: number;
  demos_limit: number;
  plan_tier: string | null;
  converted_at: string | null;
  first_contact_at: string;
  demo_sent_at: string | null;
  demo_delivered_at: string | null;
  offer_sent_at: string | null;
  last_activity_at: string;
  last_job_id: string | null;
  notes: string | null;
  utm_source: string | null;
  created_at: string;
}

// ============================================================================
// Validation schemas
// ============================================================================

const RegisterSchema = z.object({
  phone:      z.string().min(10).max(20),
  name:       z.string().optional(),
  source:     z.enum(['whatsapp', 'instagram', 'direct', 'referral']).default('whatsapp'),
  utm_source: z.string().optional(),
});

const UpdateStageSchema = z.object({
  stage: z.enum(['new', 'demo_sent', 'demo_processing', 'demo_delivered', 'offer_sent', 'converted', 'lost', 'reactivated']),
  notes: z.string().optional(),
  job_id: z.string().uuid().optional(),
  plan_tier: z.enum(['basic', 'pro', 'business']).optional(),
  force: z.boolean().optional().default(false), // Pular validação de máquina de estados
});

const VALID_LEAD_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  'new': ['demo_sent', 'demo_processing', 'lost'],
  'demo_sent': ['demo_processing', 'lost'],
  'demo_processing': ['demo_delivered', 'lost'],
  'demo_delivered': ['offer_sent', 'lost', 'demo_processing'],
  'offer_sent': ['converted', 'lost', 'demo_processing'],
  'converted': ['reactivated'],
  'lost': ['reactivated'],
  'reactivated': ['demo_sent', 'demo_processing'],
};

const AddEventSchema = z.object({
  event_type: z.enum(['message_received', 'message_sent', 'pdf_received', 'demo_completed', 'offer_sent', 'follow_up_sent', 'converted', 'opted_out', 'reactivated']),
  direction: z.enum(['inbound', 'outbound']).optional(),
  content: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Helpers
// ============================================================================

/** Valida se a transição de estágio é permitida pela regra de negócio. */
function isValidLeadTransition(current: LeadStage, next: LeadStage): boolean {
  if (current === next) return true;
  const allowed = VALID_LEAD_TRANSITIONS[current];
  return allowed ? allowed.includes(next) : true;
}

function requireSupabase(res: Response): boolean {
  if (!supabase) {
    sendError(res, 'SERVICE_UNAVAILABLE', 'Leads service not available — Supabase not configured', 503);
    return false;
  }
  return true;
}

/** Ativa o plano trial (basic, 30 dias) na tabela bookagent_plan_overrides. */
async function activateTrial(phone: string): Promise<void> {
  if (!supabase) return;
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  try {
    await supabase.insert('bookagent_plan_overrides', {
      user_id:     phone,
      plan_tier:   'basic',
      valid_until: validUntil.toISOString(),
      reason:      'trial',
    });
  } catch (err) {
    // Não bloquear o registro se o override já existir
    logger.warn(`[Leads] Trial override insert failed for ${phone}: ${err}`);
  }
}

/** Registra um evento de interação com o lead. */
async function insertEvent(
  leadId: string,
  type: LeadEventType,
  direction?: 'inbound' | 'outbound',
  content?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.insert('bookagent_lead_events', {
      lead_id:    leadId,
      event_type: type,
      direction,
      content,
      metadata,
    });
  } catch (err) {
    logger.warn(`[Leads] Event insert failed for lead=${leadId}: ${err}`);
  }
}

/** Monta o resumo do lead para a resposta da API. */
function buildLeadSummary(lead: LeadRow, isNew: boolean) {
  const demosRemaining = Math.max(0, lead.demos_limit - lead.demos_used);
  return {
    lead_id:         lead.id,
    phone:           lead.phone,
    name:            lead.name,
    source:          lead.source,
    stage:           lead.stage,
    is_new:          isNew,
    demos_used:      lead.demos_used,
    demos_limit:     lead.demos_limit,
    demos_remaining: demosRemaining,
    trial_active:    demosRemaining > 0 && !lead.plan_tier,
    plan_tier:       lead.plan_tier,
    converted:       !!lead.converted_at,
    converted_at:    lead.converted_at,
    first_contact_at: lead.first_contact_at,
    last_activity_at: lead.last_activity_at,
  };
}

// ============================================================================
// POST /api/v1/leads/register
// ============================================================================

/**
 * Registra um novo lead ou atualiza o retorno de um lead existente.
 *
 * Chamado pelo Fluxo 7 do n8n quando qualquer mensagem chega pelo WhatsApp.
 * Responde com dados suficientes para o Fluxo 7 decidir:
 *   - demos_remaining: quantas demos grátis ainda restam
 *   - is_new: se é o primeiro contato
 *   - stage: estado atual no funil
 */
export async function registerLead(req: Request, res: Response): Promise<void> {
  if (!requireSupabase(res)) return;

  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten());
    return;
  }

  const { phone, name, source, utm_source } = parsed.data;

  try {
    // Verificar se lead já existe
    const existing = await supabase!.select<LeadRow>('bookagent_leads', {
      filters: [{ column: 'phone', operator: 'eq', value: phone }],
      limit: 1,
    });

    if (existing.length > 0) {
      // Lead retornando — atualizar last_activity_at
      const lead = existing[0];
      await supabase!.update('bookagent_leads',
        { column: 'phone', operator: 'eq', value: phone },
        { last_activity_at: new Date().toISOString() },
      );

      // Atualizar nome se veio agora e não tinha antes
      if (name && !lead.name) {
        await supabase!.update('bookagent_leads',
          { column: 'phone', operator: 'eq', value: phone },
          { name },
        );
      }

      await insertEvent(lead.id, 'message_received', 'inbound', 'Lead retornou');

      logger.info(`[Leads] Lead retornou: phone=${phone} stage=${lead.stage} demos_used=${lead.demos_used}`);
      sendSuccess(res, buildLeadSummary(lead, false));
      return;
    }

    // Novo lead — inserir
    const now = new Date().toISOString();
    const inserted = await supabase!.insert<Partial<LeadRow>>('bookagent_leads', {
      phone,
      name:              name ?? null,
      source,
      stage:             'new',
      demos_used:        0,
      demos_limit:       3,
      utm_source:        utm_source ?? null,
      first_contact_at:  now,
      last_activity_at:  now,
    });

    const newLead = inserted[0] as LeadRow;

    // Ativar trial
    await activateTrial(phone);

    // Log evento de primeiro contato
    await insertEvent(newLead.id, 'message_received', 'inbound', 'Primeiro contato');

    logger.info(`[Leads] Novo lead registrado: phone=${phone} id=${newLead.id} source=${source}`);
    sendSuccess(res, buildLeadSummary(newLead, true), 201);
  } catch (err) {
    logger.error(`[Leads] registerLead failed: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao registrar lead', 500);
  }
}

// ============================================================================
// GET /api/v1/leads/:phone
// ============================================================================

/**
 * Retorna os dados do lead pelo número de telefone.
 *
 * Usado pelo Fluxo 7 e 8 para verificar estado antes de enviar mensagens.
 */
export async function getLead(req: Request, res: Response): Promise<void> {
  if (!requireSupabase(res)) return;

  const { phone } = req.params;
  if (!phone) {
    sendError(res, 'MISSING_PARAM', 'phone is required', 400);
    return;
  }

  try {
    const rows = await supabase!.select<LeadRow>('bookagent_leads', {
      filters: [{ column: 'phone', operator: 'eq', value: phone }],
      limit: 1,
    });

    if (rows.length === 0) {
      sendError(res, 'NOT_FOUND', 'Lead não encontrado', 404);
      return;
    }

    sendSuccess(res, buildLeadSummary(rows[0], false));
  } catch (err) {
    logger.error(`[Leads] getLead failed for phone=${phone}: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar lead', 500);
  }
}

// ============================================================================
// PATCH /api/v1/leads/:phone/stage
// ============================================================================

/**
 * Atualiza o estágio do lead no funil.
 *
 * Chamado pelo n8n nos Fluxos 7 e 8 a cada transição:
 *   new → demo_sent → demo_processing → demo_delivered → offer_sent → converted/lost
 */
export async function updateLeadStage(req: Request, res: Response): Promise<void> {
  if (!requireSupabase(res)) return;

  const { phone } = req.params;
  const parsed = UpdateStageSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten());
    return;
  }

  const { stage, notes, job_id, plan_tier, force } = parsed.data;

  try {
    // Verificar que o lead existe
    const rows = await supabase!.select<LeadRow>('bookagent_leads', {
      filters: [{ column: 'phone', operator: 'eq', value: phone }],
      limit: 1,
    });

    if (rows.length === 0) {
      sendError(res, 'NOT_FOUND', 'Lead não encontrado', 404);
      return;
    }

    const lead = rows[0];

    // Validação da máquina de estados
    if (!force && !isValidLeadTransition(lead.stage, stage)) {
      sendError(
        res,
        'INVALID_TRANSITION',
        `Transição comercial inválida: ${lead.stage} → ${stage}. Use 'force: true' para pular.`,
        409,
      );
      return;
    }

    const updates: Partial<LeadRow> = {
      stage,
      last_activity_at: new Date().toISOString(),
    };

    if (notes) updates.notes = notes;
    if (job_id) updates.last_job_id = job_id;

    // Campos específicos por estágio
    const now = new Date().toISOString();
    if (stage === 'demo_sent')      updates.demo_sent_at = now as unknown as string;
    if (stage === 'demo_delivered') updates.demo_delivered_at = now as unknown as string;
    if (stage === 'offer_sent')     updates.offer_sent_at = now as unknown as string;
    if (stage === 'converted') {
      updates.converted_at = now as unknown as string;
      if (plan_tier) updates.plan_tier = plan_tier;
    }

    await supabase!.update('bookagent_leads',
      { column: 'phone', operator: 'eq', value: phone },
      updates,
    );

    // Log de evento mapeado ao estágio
    const eventTypeMap: Partial<Record<LeadStage, LeadEventType>> = {
      demo_sent:       'message_sent',
      demo_delivered:  'demo_completed',
      offer_sent:      'offer_sent',
      converted:       'converted',
      lost:            'opted_out',
      reactivated:     'reactivated',
    };
    const eventType = eventTypeMap[stage];
    if (eventType) {
      await insertEvent(lead.id, eventType, stage === 'demo_sent' ? 'outbound' : undefined);
    }

    logger.info(`[Leads] Stage atualizado: phone=${phone} ${lead.stage} → ${stage}`);
    sendSuccess(res, { phone, previous_stage: lead.stage, stage });
  } catch (err) {
    logger.error(`[Leads] updateLeadStage failed for phone=${phone}: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao atualizar estágio do lead', 500);
  }
}

// ============================================================================
// POST /api/v1/leads/:phone/event
// ============================================================================

/**
 * Registra um evento de interação com o lead.
 *
 * Chamado pelo n8n para logar mensagens enviadas/recebidas, PDFs, follow-ups, etc.
 */
export async function addLeadEvent(req: Request, res: Response): Promise<void> {
  if (!requireSupabase(res)) return;

  const { phone } = req.params;
  const parsed = AddEventSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Invalid request body', 400, parsed.error.flatten());
    return;
  }

  const { event_type, direction, content, metadata } = parsed.data;

  try {
    const rows = await supabase!.select<LeadRow>('bookagent_leads', {
      filters: [{ column: 'phone', operator: 'eq', value: phone }],
      select: 'id',
      limit: 1,
    });

    if (rows.length === 0) {
      sendError(res, 'NOT_FOUND', 'Lead não encontrado', 404);
      return;
    }

    const leadId = rows[0].id;
    await insertEvent(leadId, event_type, direction, content, metadata as Record<string, unknown> | undefined);

    // Atualizar last_activity_at
    await supabase!.update('bookagent_leads',
      { column: 'phone', operator: 'eq', value: phone },
      { last_activity_at: new Date().toISOString() },
    );

    sendSuccess(res, { lead_id: leadId, event_type, recorded: true });
  } catch (err) {
    logger.error(`[Leads] addLeadEvent failed for phone=${phone}: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao registrar evento', 500);
  }
}

// ============================================================================
// POST /api/v1/leads/:phone/demo
// ============================================================================

/**
 * Incrementa demos_used do lead (chamado pelo Fluxo 7 ao iniciar uma demo).
 *
 * Retorna o estado atualizado para o n8n decidir:
 *   - demos_remaining: quantas demos ainda restam após incremento
 *   - blocked: true se o limite foi atingido
 */
export async function incrementDemoUsed(req: Request, res: Response): Promise<void> {
  if (!requireSupabase(res)) return;

  const { phone } = req.params;

  try {
    const rows = await supabase!.select<LeadRow>('bookagent_leads', {
      filters: [{ column: 'phone', operator: 'eq', value: phone }],
      limit: 1,
    });

    if (rows.length === 0) {
      sendError(res, 'NOT_FOUND', 'Lead não encontrado', 404);
      return;
    }

    const lead = rows[0];

    // Se já converteu, não limitar por demos
    if (lead.plan_tier) {
      sendSuccess(res, { demos_used: lead.demos_used, demos_remaining: 999, blocked: false, converted: true });
      return;
    }

    if (lead.demos_used >= lead.demos_limit) {
      logger.info(`[Leads] Demo bloqueada — limite atingido: phone=${phone} demos_used=${lead.demos_used}`);
      sendSuccess(res, {
        demos_used:      lead.demos_used,
        demos_remaining: 0,
        blocked:         true,
        converted:       false,
      });
      return;
    }

    const newDemosUsed = lead.demos_used + 1;
    await supabase!.update('bookagent_leads',
      { column: 'phone', operator: 'eq', value: phone },
      {
        demos_used:       newDemosUsed,
        stage:            'demo_processing',
        last_activity_at: new Date().toISOString(),
      },
    );

    await insertEvent(lead.id, 'pdf_received', 'inbound', `Demo ${newDemosUsed} de ${lead.demos_limit}`);

    const demosRemaining = lead.demos_limit - newDemosUsed;
    logger.info(`[Leads] Demo iniciada: phone=${phone} demos_used=${newDemosUsed}/${lead.demos_limit}`);

    sendSuccess(res, {
      demos_used:      newDemosUsed,
      demos_remaining: demosRemaining,
      blocked:         false,
      converted:       false,
    });
  } catch (err) {
    logger.error(`[Leads] incrementDemoUsed failed for phone=${phone}: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao registrar uso de demo', 500);
  }
}
