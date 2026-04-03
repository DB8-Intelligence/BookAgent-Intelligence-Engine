/**
 * Profile Resolver
 *
 * Transforma UserContext (dados brutos do usuário) em um
 * PersonalizationProfile completo e resolvido, pronto para
 * ser injetado nos planos de mídia, blog e landing page.
 *
 * Responsabilidades:
 * 1. Formatar WhatsApp (link wa.me)
 * 2. Formatar Instagram (handle + link)
 * 3. Resolver CTA com textos padrão
 * 4. Montar bloco de contato com canais disponíveis
 * 5. Preparar overlay de branding do usuário
 */

import type { UserContext } from '../../domain/entities/user-context.js';
import type {
  PersonalizationProfile,
  CTAProfile,
  ContactBlock,
  ContactChannel,
  UserBrandingOverlay,
} from '../../domain/entities/personalization.js';
import { LogoPlacement } from '../../domain/entities/personalization.js';

/**
 * Resolve UserContext em PersonalizationProfile.
 * Se não houver dados do usuário, retorna profile vazio com applied=false.
 */
export function resolveProfile(userContext?: UserContext): PersonalizationProfile {
  if (!userContext || isEmptyContext(userContext)) {
    return {
      userContext: userContext ?? {},
      cta: buildDefaultCTA(),
      contact: buildDefaultContact(),
      branding: buildDefaultBranding(),
      applied: false,
    };
  }

  return {
    userContext,
    cta: buildCTA(userContext),
    contact: buildContact(userContext),
    branding: buildBranding(userContext),
    applied: true,
  };
}

// ---------------------------------------------------------------------------
// CTA
// ---------------------------------------------------------------------------

function buildCTA(ctx: UserContext): CTAProfile {
  const name = ctx.name ?? 'nosso consultor';
  const hasWhatsApp = !!ctx.whatsapp;
  const hasInstagram = !!ctx.instagram;

  let primaryText = 'Agende sua visita';
  if (hasWhatsApp) {
    primaryText = `Fale com ${name} pelo WhatsApp`;
  } else if (hasInstagram) {
    primaryText = `Fale com ${name} pelo Instagram`;
  }

  let secondaryText = 'Entre em contato para condições especiais';
  if (ctx.region) {
    secondaryText = `Atendimento especializado na região ${ctx.region}`;
  }

  return {
    primaryText,
    secondaryText,
    whatsappNumber: ctx.whatsapp ? formatWhatsAppNumber(ctx.whatsapp) : undefined,
    whatsappLink: ctx.whatsapp ? buildWhatsAppLink(ctx.whatsapp, name) : undefined,
    instagramHandle: ctx.instagram ? formatInstagramHandle(ctx.instagram) : undefined,
    instagramLink: ctx.instagram ? buildInstagramLink(ctx.instagram) : undefined,
    siteUrl: ctx.site ?? undefined,
    phoneNumber: ctx.whatsapp ?? undefined,
  };
}

function buildDefaultCTA(): CTAProfile {
  return {
    primaryText: 'Agende sua visita',
    secondaryText: 'Entre em contato para condições especiais',
  };
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

function buildContact(ctx: UserContext): ContactBlock {
  const channels: ContactChannel[] = [];

  if (ctx.whatsapp) {
    channels.push({
      type: 'whatsapp',
      label: 'WhatsApp',
      value: formatWhatsAppNumber(ctx.whatsapp),
      link: buildWhatsAppLink(ctx.whatsapp, ctx.name),
    });
  }

  if (ctx.instagram) {
    channels.push({
      type: 'instagram',
      label: 'Instagram',
      value: formatInstagramHandle(ctx.instagram),
      link: buildInstagramLink(ctx.instagram),
    });
  }

  if (ctx.site) {
    channels.push({
      type: 'site',
      label: 'Site',
      value: ctx.site,
      link: ctx.site.startsWith('http') ? ctx.site : `https://${ctx.site}`,
    });
  }

  return {
    displayName: ctx.name ?? 'Consultor',
    region: ctx.region,
    channels,
  };
}

function buildDefaultContact(): ContactBlock {
  return {
    displayName: 'Consultor',
    channels: [],
  };
}

// ---------------------------------------------------------------------------
// Branding overlay
// ---------------------------------------------------------------------------

function buildBranding(ctx: UserContext): UserBrandingOverlay {
  return {
    hasLogo: !!ctx.logoUrl,
    logoUrl: ctx.logoUrl,
    logoPlacement: LogoPlacement.BOTTOM_RIGHT,
    signature: ctx.name ?? 'Consultor',
    region: ctx.region,
  };
}

function buildDefaultBranding(): UserBrandingOverlay {
  return {
    hasLogo: false,
    logoPlacement: LogoPlacement.BOTTOM_RIGHT,
    signature: '',
  };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatWhatsAppNumber(raw: string): string {
  // Remover tudo que não é dígito
  const digits = raw.replace(/\D/g, '');

  // Se não começa com 55, adicionar código do Brasil
  if (digits.length <= 11 && !digits.startsWith('55')) {
    return '55' + digits;
  }
  return digits;
}

function buildWhatsAppLink(raw: string, name?: string): string {
  const number = formatWhatsAppNumber(raw);
  const message = name
    ? `Olá ${name}, gostaria de saber mais sobre o empreendimento.`
    : 'Olá, gostaria de saber mais sobre o empreendimento.';
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function formatInstagramHandle(raw: string): string {
  // Remover @ se já tiver, e adicionar
  const handle = raw.replace(/^@/, '').trim();
  return `@${handle}`;
}

function buildInstagramLink(raw: string): string {
  const handle = raw.replace(/^@/, '').trim();
  return `https://instagram.com/${handle}`;
}

function isEmptyContext(ctx: UserContext): boolean {
  return !ctx.name && !ctx.whatsapp && !ctx.instagram && !ctx.site && !ctx.logoUrl;
}
