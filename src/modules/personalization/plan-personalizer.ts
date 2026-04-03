/**
 * Plan Personalizer
 *
 * Aplica PersonalizationProfile nos planos existentes:
 * - MediaPlan: logo overlay, CTA em cenas finais
 * - BlogPlan: CTA final, assinatura, dados de contato
 * - LandingPagePlan: contato, WhatsApp, formulário, footer
 *
 * Preserva o branding original do material — a personalização
 * do usuário é uma camada adicional, não uma substituição.
 */

import type { PersonalizationProfile } from '../../domain/entities/personalization.js';
import type { MediaPlan, MediaScene } from '../../domain/entities/media-plan.js';
import type { BlogPlan } from '../../domain/entities/blog-plan.js';
import type { LandingPagePlan, LandingPageSection } from '../../domain/entities/landing-page-plan.js';
import { LPSectionType } from '../../domain/entities/landing-page-plan.js';
import { BeatRole } from '../../domain/entities/narrative.js';

// ---------------------------------------------------------------------------
// MediaPlan personalization
// ---------------------------------------------------------------------------

/**
 * Personaliza MediaPlans com dados do usuário.
 * - Marca showLogo=true nas cenas HOOK e CTA
 * - Injeta CTA text nas cenas finais
 * - Adiciona renderMetadata com dados do usuário
 */
export function personalizeMediaPlans(
  plans: MediaPlan[],
  profile: PersonalizationProfile,
): MediaPlan[] {
  return plans.map((plan) => ({
    ...plan,
    scenes: plan.scenes.map((scene) =>
      personalizeMediaScene(scene, profile),
    ),
    requiresPersonalization: false, // Já foi personalizado
    renderMetadata: {
      ...plan.renderMetadata,
      userLogo: profile.branding.logoUrl ?? null,
      userLogoPlacement: profile.branding.logoPlacement,
      userSignature: profile.branding.signature,
      userRegion: profile.branding.region ?? null,
      ctaPrimary: profile.cta.primaryText,
      ctaSecondary: profile.cta.secondaryText,
      whatsappLink: profile.cta.whatsappLink ?? null,
    },
  }));
}

function personalizeMediaScene(
  scene: MediaScene,
  profile: PersonalizationProfile,
): MediaScene {
  // Cenas de CTA: injetar texto de CTA personalizado
  if (scene.role === BeatRole.CTA) {
    const ctaOverlays = [...scene.textOverlays];

    // Substituir ou adicionar CTA text
    const existingCTA = ctaOverlays.findIndex((o) => o.role === 'cta');
    if (existingCTA >= 0) {
      ctaOverlays[existingCTA] = {
        ...ctaOverlays[existingCTA],
        text: profile.cta.primaryText,
      };
    } else {
      ctaOverlays.push({
        text: profile.cta.primaryText,
        role: 'cta',
        position: 'center',
        size: 'large',
      });
    }

    // Adicionar contato como caption se disponível
    if (profile.cta.whatsappNumber) {
      ctaOverlays.push({
        text: profile.cta.whatsappNumber,
        role: 'caption',
        position: 'bottom',
        size: 'small',
      });
    }

    return {
      ...scene,
      textOverlays: ctaOverlays,
      branding: {
        ...scene.branding,
        showLogo: profile.branding.hasLogo,
      },
    };
  }

  // Cena de HOOK: mostrar logo se disponível
  if (scene.role === BeatRole.HOOK) {
    return {
      ...scene,
      branding: {
        ...scene.branding,
        showLogo: profile.branding.hasLogo,
      },
    };
  }

  // Cena de CLOSING: adicionar assinatura
  if (scene.role === BeatRole.CLOSING && profile.branding.signature) {
    const overlays = [...scene.textOverlays];
    overlays.push({
      text: profile.branding.signature,
      role: 'caption',
      position: 'bottom',
      size: 'small',
    });

    return { ...scene, textOverlays: overlays };
  }

  return scene;
}

// ---------------------------------------------------------------------------
// BlogPlan personalization
// ---------------------------------------------------------------------------

/**
 * Personaliza BlogPlans com dados do usuário.
 * - Injeta CTA final com contato do usuário
 * - Adiciona assinatura ao artigo
 * - Complementa keywords com região
 */
export function personalizeBlogPlans(
  plans: BlogPlan[],
  profile: PersonalizationProfile,
): BlogPlan[] {
  return plans.map((plan) => {
    // CTA final personalizado
    const ctaParts: string[] = [profile.cta.primaryText + '.'];

    if (profile.cta.whatsappLink) {
      ctaParts.push(`WhatsApp: ${profile.cta.whatsappNumber}`);
    }
    if (profile.cta.instagramHandle) {
      ctaParts.push(`Instagram: ${profile.cta.instagramHandle}`);
    }
    if (profile.cta.siteUrl) {
      ctaParts.push(`Site: ${profile.cta.siteUrl}`);
    }
    ctaParts.push(profile.cta.secondaryText);

    const personalizedCTA = ctaParts.join(' | ');

    // Keywords complementadas com região
    const keywords = [...plan.keywords];
    if (profile.branding.region && !keywords.includes(profile.branding.region.toLowerCase())) {
      keywords.push(profile.branding.region.toLowerCase());
    }

    // Conclusão com assinatura
    let conclusion = plan.conclusion;
    if (profile.branding.signature) {
      conclusion += `\n\n— ${profile.branding.signature}`;
      if (profile.branding.region) {
        conclusion += `, ${profile.branding.region}`;
      }
    }

    return {
      ...plan,
      ctaText: personalizedCTA,
      conclusion,
      keywords,
    };
  });
}

// ---------------------------------------------------------------------------
// LandingPagePlan personalization
// ---------------------------------------------------------------------------

/**
 * Personaliza LandingPagePlans com dados do usuário.
 * - Injeta contato em CTA sections
 * - Atualiza footer com dados completos
 * - Marca logo em hero e footer
 * - Adiciona WhatsApp link em CTAs inline
 */
export function personalizeLandingPagePlans(
  plans: LandingPagePlan[],
  profile: PersonalizationProfile,
): LandingPagePlan[] {
  return plans.map((plan) => ({
    ...plan,
    sections: plan.sections.map((section) =>
      personalizeLPSection(section, profile),
    ),
  }));
}

function personalizeLPSection(
  section: LandingPageSection,
  profile: PersonalizationProfile,
): LandingPageSection {
  switch (section.sectionType) {
    case LPSectionType.HERO:
      return {
        ...section,
        // Adicionar sub-CTA no hero
        ctaText: profile.cta.primaryText,
      };

    case LPSectionType.CTA_INLINE:
      return {
        ...section,
        ctaText: profile.cta.primaryText,
        contentPoints: buildCTAContentPoints(profile),
      };

    case LPSectionType.CTA_FORM: {
      const formPoints = [
        'Nome completo',
        'WhatsApp',
        'E-mail',
        'Tipologia de interesse',
      ];

      return {
        ...section,
        heading: profile.cta.primaryText,
        subheading: profile.cta.secondaryText,
        contentPoints: formPoints,
        ctaText: 'Enviar',
      };
    }

    case LPSectionType.FOOTER:
      return {
        ...section,
        heading: profile.contact.displayName,
        subheading: profile.contact.region ?? 'Atendimento especializado',
        contentPoints: buildFooterContentPoints(profile),
        ctaText: profile.cta.whatsappLink
          ? 'Chamar no WhatsApp'
          : 'Entrar em contato',
      };

    default:
      return section;
  }
}

function buildCTAContentPoints(profile: PersonalizationProfile): string[] {
  const points: string[] = [];

  if (profile.cta.whatsappNumber) {
    points.push(`📱 WhatsApp: ${profile.cta.whatsappNumber}`);
  }
  if (profile.cta.instagramHandle) {
    points.push(`📸 Instagram: ${profile.cta.instagramHandle}`);
  }
  if (profile.cta.siteUrl) {
    points.push(`🌐 ${profile.cta.siteUrl}`);
  }
  if (profile.contact.region) {
    points.push(`📍 ${profile.contact.region}`);
  }

  return points;
}

function buildFooterContentPoints(profile: PersonalizationProfile): string[] {
  const points: string[] = [];

  points.push(profile.contact.displayName);

  for (const channel of profile.contact.channels) {
    points.push(`${channel.label}: ${channel.value}`);
  }

  if (profile.contact.region) {
    points.push(`Região: ${profile.contact.region}`);
  }

  return points;
}
