/**
 * Provider Factory — Billing Gateway Integration
 *
 * Resolve o billing provider correto baseado em configuração.
 * Env var: BILLING_PROVIDER (stripe | asaas | manual)
 * Default: manual
 *
 * Parte 76: Billing Gateway Integration
 */

import { BillingProvider } from '../../domain/entities/subscription.js';
import type { IBillingProvider } from './billing-provider.js';
import { ManualBillingProvider } from './providers/manual-provider.js';
import { StripeBillingProvider } from './providers/stripe-provider.js';
import { HotmartBillingProvider } from './providers/hotmart-provider.js';
import { KiwifyBillingProvider } from './providers/kiwify-provider.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const providers = new Map<BillingProvider, IBillingProvider>();
providers.set(BillingProvider.MANUAL, new ManualBillingProvider());
providers.set(BillingProvider.STRIPE, new StripeBillingProvider());
providers.set(BillingProvider.HOTMART, new HotmartBillingProvider());
providers.set(BillingProvider.KIWIFY, new KiwifyBillingProvider());

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Retorna o billing provider configurado.
 * Env var: BILLING_PROVIDER (stripe | asaas | manual)
 */
export function getBillingProvider(): IBillingProvider {
  const envProvider = process.env.BILLING_PROVIDER ?? 'manual';

  const provider = providers.get(envProvider as BillingProvider);
  if (provider && provider.isConfigured()) {
    return provider;
  }

  // Fallback to manual
  logger.info(
    `[BillingProviderFactory] Provider "${envProvider}" not configured — using manual`,
  );
  return providers.get(BillingProvider.MANUAL)!;
}

/**
 * Retorna um provider específico por tipo.
 */
export function getProviderByType(type: BillingProvider): IBillingProvider | null {
  return providers.get(type) ?? null;
}

/**
 * Registra um provider customizado.
 */
export function registerBillingProvider(provider: IBillingProvider): void {
  providers.set(provider.provider, provider);
  logger.info(`[BillingProviderFactory] Registered: ${provider.name}`);
}

/**
 * Retorna status de todos os providers.
 */
export function getProviderStatus(): Array<{
  provider: BillingProvider;
  name: string;
  configured: boolean;
}> {
  return [...providers.values()].map((p) => ({
    provider: p.provider,
    name: p.name,
    configured: p.isConfigured(),
  }));
}
