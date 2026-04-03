/**
 * Entity: UserContext
 *
 * Dados de personalização do usuário (corretor/imobiliária).
 * Usados para injetar logo, CTA e dados de contato nos outputs.
 */

export interface UserContext {
  name?: string;
  whatsapp?: string;
  instagram?: string;
  site?: string;
  region?: string;
  logoUrl?: string;
}
