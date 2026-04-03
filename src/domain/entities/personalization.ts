/**
 * Entity: PersonalizationResult
 *
 * Resultado da aplicação de personalização nos planos gerados.
 *
 * Registra o que foi personalizado, quais planos foram afetados,
 * e os dados do usuário que foram injetados.
 *
 * Também define o PersonalizationProfile — a versão "resolvida"
 * dos dados do usuário pronta para injeção nos planos.
 */

import type { UserContext } from './user-context.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Posição do logo do usuário */
export enum LogoPlacement {
  TOP_LEFT = 'top-left',
  TOP_RIGHT = 'top-right',
  BOTTOM_LEFT = 'bottom-left',
  BOTTOM_RIGHT = 'bottom-right',
  CENTER = 'center',
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** CTA resolvido com dados do usuário */
export interface CTAProfile {
  /** Texto principal do CTA */
  primaryText: string;

  /** Texto secundário (sub-CTA) */
  secondaryText: string;

  /** Número de WhatsApp formatado */
  whatsappNumber?: string;

  /** Link para WhatsApp (wa.me) */
  whatsappLink?: string;

  /** Handle do Instagram */
  instagramHandle?: string;

  /** Link do Instagram */
  instagramLink?: string;

  /** URL do site */
  siteUrl?: string;

  /** Telefone para ligação */
  phoneNumber?: string;
}

/** Bloco de contato consolidado */
export interface ContactBlock {
  /** Nome completo do usuário/empresa */
  displayName: string;

  /** Região de atuação */
  region?: string;

  /** Canais de contato disponíveis */
  channels: ContactChannel[];
}

export interface ContactChannel {
  type: 'whatsapp' | 'instagram' | 'site' | 'phone' | 'email';
  label: string;
  value: string;
  link?: string;
}

/** Overlay de branding do usuário */
export interface UserBrandingOverlay {
  /** Se o usuário tem logo disponível */
  hasLogo: boolean;

  /** URL do logo (se disponível) */
  logoUrl?: string;

  /** Posição recomendada do logo */
  logoPlacement: LogoPlacement;

  /** Nome para assinatura */
  signature: string;

  /** Região para contextualização */
  region?: string;
}

/** Perfil de personalização completo (resolvido) */
export interface PersonalizationProfile {
  /** Dados brutos do usuário */
  userContext: UserContext;

  /** CTA resolvido */
  cta: CTAProfile;

  /** Bloco de contato */
  contact: ContactBlock;

  /** Overlay de branding */
  branding: UserBrandingOverlay;

  /** Se a personalização foi efetivamente aplicada */
  applied: boolean;
}

// ---------------------------------------------------------------------------
// PersonalizationResult
// ---------------------------------------------------------------------------

export interface PersonalizationResult {
  /** Perfil de personalização usado */
  profile: PersonalizationProfile;

  /** Quantos media plans foram personalizados */
  mediaPlansPersonalized: number;

  /** Quantos blog plans foram personalizados */
  blogPlansPersonalized: number;

  /** Quantos landing page plans foram personalizados */
  landingPagePlansPersonalized: number;

  /** Itens que não puderam ser personalizados */
  skipped: string[];
}
