/**
 * Secrets Utility — leitura segura de credenciais via env vars
 *
 * No Cloud Run, secrets do Secret Manager são injetados como env vars
 * via --set-secrets (cloudbuild.yaml). Ou seja, `process.env.X` lê do
 * Secret Manager automaticamente. Este módulo centraliza a leitura e
 * adiciona:
 *   - getSecret(name, { required }) — lança se required+ausente
 *   - auditSecrets() — status de cada secret esperado (pra /health)
 *   - validateStartupSecrets() — roda no boot e loga avisos claros
 *
 * IMPORTANTE: NUNCA logar o valor do secret, só presença/ausência.
 * O utility mascara qualquer tentativa.
 */

import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Catálogo de secrets esperados em produção
// ---------------------------------------------------------------------------

/** Origem esperada de cada secret (pra diagnóstico) */
export type SecretSource = 'secret-manager' | 'env' | 'default';

export interface SecretDef {
  name: string;
  /** Obrigatório em produção (NODE_ENV=production) */
  requiredInProd: boolean;
  /** Descrição pra mensagens de erro */
  description: string;
  /** Se em produção deve vir do Secret Manager (warning se vir de .env) */
  expectedSource?: SecretSource;
}

export const EXPECTED_SECRETS: SecretDef[] = [
  // --- Firebase (auth + Firestore) — pilar primário da arquitetura ---------
  {
    name: 'GOOGLE_CLOUD_PROJECT',
    requiredInProd: true,
    description: 'Project ID do GCP/Firebase — usado pelo Firestore, Cloud Tasks',
    expectedSource: 'env',
  },
  {
    name: 'NEXT_PUBLIC_FIREBASE_API_KEY',
    requiredInProd: true,
    description: 'Firebase API key (browser) — inlineado no bundle em build-time',
    expectedSource: 'secret-manager',
  },
  // --- AI providers --------------------------------------------------------
  {
    name: 'ANTHROPIC_API_KEY',
    requiredInProd: false, // opcional quando AI_PROVIDER=gemini
    description: 'API key Anthropic Claude (fallback quando AI_PROVIDER=anthropic)',
    expectedSource: 'secret-manager',
  },
  {
    name: 'SHOTSTACK_API_KEY',
    requiredInProd: false, // opcional quando VIDEO_RENDERER=ffmpeg
    description: 'Shotstack cloud video rendering (opcional, default é ffmpeg local)',
    expectedSource: 'secret-manager',
  },
  // --- Supabase legado — ainda usado por módulos não migrados --------------
  // (billing/analytics/admin/bugs/leads/campaigns). Remover quando migrarmos.
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    requiredInProd: false,
    description: 'Supabase service role (legacy modules only — billing/analytics/admin)',
    expectedSource: 'secret-manager',
  },
  {
    name: 'N8N_WEBHOOK_TOKEN',
    requiredInProd: false,
    description: 'HMAC token pra validar webhooks do n8n',
    expectedSource: 'secret-manager',
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GetSecretOptions {
  required?: boolean;
  defaultValue?: string;
}

/**
 * Lê um secret via process.env. Lança se required=true e ausente.
 *
 * Em Cloud Run com --set-secrets, process.env.X vem do Secret Manager.
 * Em dev local, vem do .env ou env var exportada no shell.
 * O código não sabe nem precisa saber a origem — só que está no env.
 */
export function getSecret(name: string, opts: GetSecretOptions = {}): string | undefined {
  const value = process.env[name];

  if (value === undefined || value === '') {
    if (opts.required) {
      throw new Error(
        `[Secrets] ${name} is required but not set. ` +
        `In production, check Cloud Run --set-secrets mapping. ` +
        `Locally, add to .env.`,
      );
    }
    return opts.defaultValue;
  }

  return value;
}

/**
 * Auditoria de todos os secrets esperados.
 * Retorna status de presença (NUNCA o valor).
 * Usado por /health endpoint e startup validation.
 */
export interface SecretAuditEntry {
  name: string;
  present: boolean;
  requiredInProd: boolean;
  /** Comprimento do valor (sanity check sem vazar) */
  valueLength: number;
  description: string;
}

export function auditSecrets(): SecretAuditEntry[] {
  return EXPECTED_SECRETS.map((def) => {
    const value = process.env[def.name];
    return {
      name: def.name,
      present: !!value && value.length > 0,
      requiredInProd: def.requiredInProd,
      valueLength: value?.length ?? 0,
      description: def.description,
    };
  });
}

/**
 * Validação de startup: verifica secrets obrigatórios.
 *
 * Comportamento:
 *   - Não lança NUNCA (serviços precisam subir pro Cloud Run não matar
 *     o container por startup probe timeout). Secrets faltantes viram
 *     LOG WARN/ERROR e o /health reflete. O primeiro request que precisa
 *     do secret vai falhar com erro claro, mas o servidor HTTP está up.
 *
 * Chamado em src/index.ts e src/worker.ts — DEPOIS do listen, não antes.
 */
export function validateStartupSecrets(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const audit = auditSecrets();

  const missingRequired = audit.filter((a) => a.requiredInProd && !a.present);
  const missingOptional = audit.filter((a) => !a.requiredInProd && !a.present);

  // Log presentes (sem valores)
  const present = audit.filter((a) => a.present);
  logger.info(
    `[Secrets] ${present.length}/${audit.length} present: ${present.map((p) => p.name).join(', ')}`,
  );

  if (missingOptional.length > 0) {
    logger.debug(
      `[Secrets] Optional secrets not set: ${missingOptional.map((m) => m.name).join(', ')}`,
    );
  }

  if (missingRequired.length > 0) {
    const names = missingRequired.map((m) => m.name).join(', ');

    if (isProd) {
      logger.error(
        `[Secrets] required secrets MISSING in production: ${names}. ` +
        `Check Cloud Run --set-secrets mapping. Server will run in degraded ` +
        `mode — requests depending on these secrets will fail with 5xx until fixed.`,
      );
      // NÃO lança. Container precisa subir pro Cloud Run aceitar /health.
      return;
    }

    logger.warn(
      `[Secrets] Required secrets missing (DEV mode — continuing): ${names}`,
    );
  }
}

/**
 * Helper pra mostrar apenas prefixo/sufixo seguros de um secret
 * (útil em logs de debug quando precisa saber qual key está ativa).
 */
export function maskSecret(value: string | undefined): string {
  if (!value) return '(empty)';
  if (value.length < 8) return '***';
  return `${value.slice(0, 4)}...${value.slice(-4)} (${value.length} chars)`;
}
