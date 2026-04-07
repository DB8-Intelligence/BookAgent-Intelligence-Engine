/**
 * Integration Contract — External Integrations Expansion
 *
 * Interface base que toda integração externa pode implementar.
 * Não obrigatória — integrações existentes (social adapters, billing providers)
 * mantêm suas interfaces originais. Este contrato unifica as operações
 * comuns de config, health e ação para o registry.
 *
 * Parte 81: External Integrations Expansion
 */

import type {
  IntegrationHealth,
  IntegrationActionResult,
} from '../../domain/entities/integration.js';

/**
 * Contrato base para integração externa.
 * Implementação opcional — o registry pode wrappear integrações
 * existentes sem forçar refatoração.
 */
export interface IExternalIntegration {
  /** ID da integração */
  readonly id: string;

  /** Nome legível */
  readonly name: string;

  /** Valida se a configuração está presente e correta */
  validateConfig(): ConfigValidationResult;

  /** Verifica saúde da integração (ping, auth check, etc.) */
  checkHealth(): Promise<IntegrationHealth>;

  /** Executa uma ação genérica (para admin/ops) */
  executeAction?(action: string, params?: Record<string, unknown>): Promise<IntegrationActionResult>;

  /** Processa webhook recebido (se aplicável) */
  handleWebhook?(payload: Record<string, unknown>, headers?: Record<string, string>): Promise<IntegrationActionResult>;
}

/**
 * Resultado da validação de configuração.
 */
export interface ConfigValidationResult {
  valid: boolean;
  missingVars: string[];
  warnings: string[];
}
