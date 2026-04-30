/**
 * Webhook Bridge — sincroniza eventos Kiwify/Hotmart/Stripe com o profile
 * do Firestore (que é a fonte de verdade pros créditos/limites).
 *
 * Como os webhooks identificam o cliente por email e o Firestore keying é
 * Firebase UID, fazemos a ponte via Firebase Admin Auth (getUserByEmail).
 *
 * Se o user ainda não se cadastrou no Firebase na hora do pagamento, logamos
 * warning e gravamos um "pending upgrade" no Firestore pra ser aplicado no
 * primeiro login (implementação em commit separado).
 */

import {
  firestore,
  resolveUidByEmail,
  getProfile,
} from '../../persistence/google-persistence.js';
import { upgradePlan } from './firestore-billing.js';
import type { PlanTier } from '../../plans/plan-config.js';
import { logger } from '../../utils/logger.js';

const VALID_TIERS: readonly PlanTier[] = ['starter', 'pro', 'agency'] as const;

export interface WebhookPlanEvent {
  source: 'kiwify' | 'hotmart' | 'stripe';
  eventType: 'activate' | 'cancel' | 'renew';
  email: string;
  planTier: string;
  externalSubscriptionId?: string;
  amountBRL?: number;
}

/**
 * Aplica o evento de webhook no Firestore. Idempotente por nature do
 * upgradePlan (Firestore update — múltiplas chamadas convergem ao mesmo
 * estado). Nunca lança — loga e retorna status pra caller decidir.
 */
export async function applyWebhookToFirestore(
  evt: WebhookPlanEvent,
): Promise<{ synced: boolean; reason?: string; uid?: string }> {
  // Normaliza tier — webhooks de Kiwify/Hotmart podem vir com "basic"/"business" legados
  const tier = normalizeTier(evt.planTier);
  if (!VALID_TIERS.includes(tier)) {
    return { synced: false, reason: `planTier inválido: ${evt.planTier}` };
  }

  // Resolve Firebase UID pelo email. Se user ainda não existe, arquiva
  // como pending pra aplicar no próximo signup.
  const uid = await resolveUidByEmail(evt.email);
  if (!uid) {
    await logPendingUpgrade(evt, tier);
    return { synced: false, reason: 'user-not-found', uid: undefined };
  }

  // Resolve o tenant ativo do user (default: solo tenant = uid).
  // Quando multi-tenant for implementado, usar profile.activeTenantId
  // OU o tenant associado à externalSubscriptionId.
  const profile = await getProfile(uid);
  const tenantId = profile?.activeTenantId ?? uid;

  try {
    if (evt.eventType === 'cancel') {
      await upgradePlan(tenantId, 'starter', { resetPeriod: false });
      await logBillingEvent(evt, uid, tenantId, 'downgrade:cancel');
    } else {
      await upgradePlan(tenantId, tier, { resetPeriod: true });
      await logBillingEvent(evt, uid, tenantId, 'upgrade');
    }
    logger.info(
      `[WebhookBridge] ${evt.source}:${evt.eventType} aplicado uid=${uid} ` +
      `tenant=${tenantId} email=${evt.email} → ${tier}`,
    );
    return { synced: true, uid };
  } catch (err) {
    logger.error(
      `[WebhookBridge] falha ao aplicar ${evt.source}:${evt.eventType} ` +
      `email=${evt.email}: ${(err as Error).message}`,
    );
    return { synced: false, reason: (err as Error).message, uid };
  }
}

// ---------------------------------------------------------------------------
// Normalização de tier — nomes legados do Hotmart/Kiwify
// ---------------------------------------------------------------------------

function normalizeTier(raw: string): PlanTier {
  const lower = (raw || '').toLowerCase();
  if (lower === 'basic') return 'starter';       // legado
  if (lower === 'business') return 'agency';     // legado
  if (VALID_TIERS.includes(lower as PlanTier)) return lower as PlanTier;
  return 'starter';
}

// ---------------------------------------------------------------------------
// Audit trail — collection billingEvents (jazz) pra ver histórico
// ---------------------------------------------------------------------------

async function logBillingEvent(
  evt: WebhookPlanEvent,
  uid: string,
  tenantId: string,
  action: string,
): Promise<void> {
  try {
    await firestore().collection('billingEvents').add({
      uid,
      tenantId,
      email: evt.email,
      source: evt.source,
      eventType: evt.eventType,
      action,
      planTier: evt.planTier,
      externalSubscriptionId: evt.externalSubscriptionId ?? null,
      amountBRL: evt.amountBRL ?? null,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn(`[WebhookBridge] billingEvents log failed: ${(err as Error).message}`);
  }
}

/**
 * Pending upgrades — quando webhook chega antes do user fazer signup
 * no Firebase. Armazena pelo email; ensureProfile checa ao criar o doc.
 */
async function logPendingUpgrade(evt: WebhookPlanEvent, tier: PlanTier): Promise<void> {
  try {
    // Doc ID = email normalizado pra ser idempotente
    const docId = evt.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
    await firestore().collection('pendingUpgrades').doc(docId).set({
      email: evt.email,
      planTier: tier,
      source: evt.source,
      externalSubscriptionId: evt.externalSubscriptionId ?? null,
      amountBRL: evt.amountBRL ?? null,
      receivedAt: new Date().toISOString(),
    }, { merge: true });
    logger.info(
      `[WebhookBridge] pending upgrade arquivado email=${evt.email} → ${tier} ` +
      `(aplicar no próximo signup)`,
    );
  } catch (err) {
    logger.warn(`[WebhookBridge] pendingUpgrades log failed: ${(err as Error).message}`);
  }
}

/**
 * Consumido pelo ensureProfile — ao criar o doc profiles/{uid} na primeira
 * vez, verifica se há upgrade pendente pro email e aplica.
 */
export async function claimPendingUpgrade(
  email: string,
  uid: string,
): Promise<PlanTier | null> {
  if (!email) return null;
  const docId = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const ref = firestore().collection('pendingUpgrades').doc(docId);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const pending = snap.data() as { planTier: PlanTier; source: string };
  const tier = normalizeTier(pending.planTier);

  // Solo tenant = uid (ensureProfile acabou de criar). Quando multi-tenant
  // for implementado, resolver via profile.activeTenantId.
  const tenantId = uid;

  try {
    await upgradePlan(tenantId, tier, { resetPeriod: true });
    await ref.delete();
    logger.info(
      `[WebhookBridge] pending upgrade aplicado email=${email} uid=${uid} ` +
      `tenant=${tenantId} → ${tier}`,
    );
    return tier;
  } catch (err) {
    logger.warn(`[WebhookBridge] claim failed: ${(err as Error).message}`);
    return null;
  }
}
