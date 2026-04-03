import { describe, it, expect } from 'vitest';
import { resolveProfile } from '../../src/modules/personalization/profile-resolver.js';
import {
  personalizeMediaPlans,
  personalizeBlogPlans,
  personalizeLandingPagePlans,
} from '../../src/modules/personalization/plan-personalizer.js';
import { createMockUserContext } from '../fixtures.js';
import { LogoPlacement } from '../../src/domain/entities/personalization.js';

// ---------------------------------------------------------------------------
// Profile Resolver
// ---------------------------------------------------------------------------

describe('Profile Resolver', () => {
  it('resolves full profile from user context', () => {
    const ctx = createMockUserContext();
    const profile = resolveProfile(ctx);

    expect(profile.applied).toBe(true);
    expect(profile.contact.displayName).toBe('Douglas Silva');
    expect(profile.contact.channels.length).toBeGreaterThan(0);
  });

  it('creates WhatsApp link with country code', () => {
    const ctx = createMockUserContext({ whatsapp: '11999887766' });
    const profile = resolveProfile(ctx);

    expect(profile.cta.whatsappNumber).toBe('5511999887766');
    expect(profile.cta.whatsappLink).toContain('wa.me/5511999887766');
  });

  it('formats Instagram handle with @', () => {
    const ctx = createMockUserContext({ instagram: 'douglas.imoveis' });
    const profile = resolveProfile(ctx);

    expect(profile.cta.instagramHandle).toBe('@douglas.imoveis');
    expect(profile.cta.instagramLink).toContain('instagram.com/douglas.imoveis');
  });

  it('handles Instagram handle that already has @', () => {
    const ctx = createMockUserContext({ instagram: '@douglas.imoveis' });
    const profile = resolveProfile(ctx);

    expect(profile.cta.instagramHandle).toBe('@douglas.imoveis');
  });

  it('sets applied=false for empty context', () => {
    const profile = resolveProfile(undefined);

    expect(profile.applied).toBe(false);
    expect(profile.contact.displayName).toBe('Consultor');
    expect(profile.contact.channels).toEqual([]);
  });

  it('sets applied=false for context with only empty fields', () => {
    const profile = resolveProfile({});

    expect(profile.applied).toBe(false);
  });

  it('resolves branding with logo placement', () => {
    const ctx = createMockUserContext({ logoUrl: 'https://example.com/logo.png' });
    const profile = resolveProfile(ctx);

    expect(profile.branding.hasLogo).toBe(true);
    expect(profile.branding.logoUrl).toBe('https://example.com/logo.png');
    expect(profile.branding.logoPlacement).toBe(LogoPlacement.BOTTOM_RIGHT);
  });

  it('sets hasLogo=false when no logoUrl', () => {
    const ctx = createMockUserContext({ logoUrl: undefined });
    const profile = resolveProfile(ctx);

    expect(profile.branding.hasLogo).toBe(false);
  });

  it('generates CTA with WhatsApp when available', () => {
    const ctx = createMockUserContext({ whatsapp: '11999887766', name: 'Douglas Silva' });
    const profile = resolveProfile(ctx);

    expect(profile.cta.primaryText).toContain('Douglas Silva');
    expect(profile.cta.primaryText).toContain('WhatsApp');
  });

  it('generates region-based secondary CTA', () => {
    const ctx = createMockUserContext({ region: 'São Paulo - Zona Sul' });
    const profile = resolveProfile(ctx);

    expect(profile.cta.secondaryText).toContain('São Paulo - Zona Sul');
  });

  it('builds contact channels for all available data', () => {
    const ctx = createMockUserContext({
      whatsapp: '11999887766',
      instagram: '@douglas',
      site: 'https://douglas.imob.com',
    });
    const profile = resolveProfile(ctx);

    expect(profile.contact.channels).toHaveLength(3);
    const types = profile.contact.channels.map((c) => c.type);
    expect(types).toContain('whatsapp');
    expect(types).toContain('instagram');
    expect(types).toContain('site');
  });
});

// ---------------------------------------------------------------------------
// Plan Personalizer — Blog
// ---------------------------------------------------------------------------

describe('Blog Plan Personalizer', () => {
  it('personalizes blog plan CTA with contact channels', () => {
    const profile = resolveProfile(createMockUserContext());
    const blogPlan = {
      id: 'blog-1',
      title: 'Residencial Vista Verde',
      slug: 'residencial-vista-verde',
      metaDescription: 'Conheça o empreendimento.',
      keywords: ['residencial', 'vista'],
      heroAssetId: 'asset-1',
      sections: [],
      introduction: 'Intro text.',
      conclusion: 'Conclusão do artigo.',
      ctaText: 'Agende sua visita',
      estimatedWordCount: 1200,
    };

    const [personalized] = personalizeBlogPlans([blogPlan], profile);

    expect(personalized.ctaText).toContain('Douglas Silva');
    expect(personalized.ctaText).toContain('WhatsApp');
    expect(personalized.conclusion).toContain('Douglas Silva');
  });

  it('adds region to keywords', () => {
    const profile = resolveProfile(createMockUserContext({ region: 'Zona Sul' }));
    const blogPlan = {
      id: 'blog-2',
      title: 'Test',
      slug: 'test',
      metaDescription: 'Test.',
      keywords: ['residencial'],
      heroAssetId: 'asset-1',
      sections: [],
      introduction: '',
      conclusion: '',
      ctaText: '',
      estimatedWordCount: 500,
    };

    const [personalized] = personalizeBlogPlans([blogPlan], profile);
    expect(personalized.keywords).toContain('zona sul');
  });
});
