/**
 * Módulo: Personalization Engine
 *
 * Último estágio do pipeline — injeta dados do usuário nos planos
 * gerados, sem destruir o branding original do material.
 *
 * Pipeline interno:
 * 1. Resolver UserContext em PersonalizationProfile
 *    (formatar WhatsApp, Instagram, montar CTA, contato, branding overlay)
 * 2. Personalizar MediaPlans (logo, CTA em cenas finais)
 * 3. Personalizar BlogPlans (CTA final, assinatura, região)
 * 4. Personalizar LandingPagePlans (contato, formulário, footer, WhatsApp)
 * 5. Salvar PersonalizationResult no context
 *
 * Se não houver dados do usuário, o módulo registra que a
 * personalização não foi aplicada mas não bloqueia o pipeline.
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { PersonalizationResult } from '../../domain/entities/personalization.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { logger } from '../../utils/logger.js';

import { resolveProfile } from './profile-resolver.js';
import {
  personalizeMediaPlans,
  personalizeBlogPlans,
  personalizeLandingPagePlans,
} from './plan-personalizer.js';

export class PersonalizationModule implements IModule {
  readonly stage = PipelineStage.PERSONALIZATION;
  readonly name = 'Personalization Engine';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const userContext = context.input.userContext;

    logger.info('[Personalization] Resolvendo perfil de personalização...');

    // --- Etapa 1: Resolver perfil ---
    const profile = resolveProfile(userContext);

    if (!profile.applied) {
      logger.info('[Personalization] Sem dados do usuário — personalização não aplicada');
      const result: PersonalizationResult = {
        profile,
        mediaPlansPersonalized: 0,
        blogPlansPersonalized: 0,
        landingPagePlansPersonalized: 0,
        skipped: ['Nenhum dado de usuário disponível'],
      };
      return { ...context, personalization: result };
    }

    logger.info(
      `[Personalization] Perfil: ${profile.contact.displayName}` +
        (profile.branding.region ? ` (${profile.branding.region})` : '') +
        `, ${profile.contact.channels.length} canais de contato` +
        (profile.branding.hasLogo ? ', com logo' : ''),
    );

    // --- Etapa 2: Personalizar MediaPlans ---
    const mediaPlans = context.mediaPlans ?? [];
    const personalizedMedia = mediaPlans.length > 0
      ? personalizeMediaPlans(mediaPlans, profile)
      : [];

    // --- Etapa 3: Personalizar BlogPlans ---
    const blogPlans = context.blogPlans ?? [];
    const personalizedBlog = blogPlans.length > 0
      ? personalizeBlogPlans(blogPlans, profile)
      : [];

    // --- Etapa 4: Personalizar LandingPagePlans ---
    const lpPlans = context.landingPagePlans ?? [];
    const personalizedLP = lpPlans.length > 0
      ? personalizeLandingPagePlans(lpPlans, profile)
      : [];

    // --- Resultado ---
    const result: PersonalizationResult = {
      profile,
      mediaPlansPersonalized: personalizedMedia.length,
      blogPlansPersonalized: personalizedBlog.length,
      landingPagePlansPersonalized: personalizedLP.length,
      skipped: [],
    };

    logPersonalizationSummary(result);

    return {
      ...context,
      mediaPlans: personalizedMedia.length > 0 ? personalizedMedia : context.mediaPlans,
      blogPlans: personalizedBlog.length > 0 ? personalizedBlog : context.blogPlans,
      landingPagePlans: personalizedLP.length > 0 ? personalizedLP : context.landingPagePlans,
      personalization: result,
    };
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logPersonalizationSummary(result: PersonalizationResult): void {
  const total =
    result.mediaPlansPersonalized +
    result.blogPlansPersonalized +
    result.landingPagePlansPersonalized;

  logger.info(
    `[Personalization] ${total} planos personalizados: ` +
      `${result.mediaPlansPersonalized} media, ` +
      `${result.blogPlansPersonalized} blog, ` +
      `${result.landingPagePlansPersonalized} landing page`,
  );

  if (result.profile.cta.whatsappLink) {
    logger.info(`[Personalization] WhatsApp: ${result.profile.cta.whatsappLink}`);
  }

  if (result.profile.branding.hasLogo) {
    logger.info(
      `[Personalization] Logo: ${result.profile.branding.logoPlacement} ` +
        `(${result.profile.branding.logoUrl})`,
    );
  }

  if (result.skipped.length > 0) {
    for (const skip of result.skipped) {
      logger.info(`[Personalization] Skipped: ${skip}`);
    }
  }
}

// Re-exports
export { resolveProfile } from './profile-resolver.js';
export {
  personalizeMediaPlans,
  personalizeBlogPlans,
  personalizeLandingPagePlans,
} from './plan-personalizer.js';
