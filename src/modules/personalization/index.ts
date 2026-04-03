/**
 * Módulo: Personalization
 *
 * Aplica personalização do usuário nos outputs gerados:
 * - Logo overlay (posicionamento automático)
 * - CTA com dados do corretor (nome, WhatsApp, Instagram, site, região)
 * - Ajustes de texto para incluir informações de contato
 *
 * É o último estágio do pipeline — recebe outputs prontos e personaliza.
 */

import type { PipelineContext } from '../../types/index.js';

export async function handlePersonalization(context: PipelineContext): Promise<PipelineContext> {
  // TODO: Implementar personalização
  // 1. Para cada output gerado
  // 2. Se há logo em context.input.userContext.logoUrl, aplicar overlay
  // 3. Injetar CTA (nome, WhatsApp, Instagram, site, região)
  // 4. Retornar outputs atualizados

  return context;
}
