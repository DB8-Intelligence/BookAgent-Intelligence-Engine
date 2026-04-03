import { describe, it, expect } from 'vitest';
import { NARRATIVE_TEMPLATES } from '../../src/modules/narrative/narrative-templates.js';
import { generateNarrativePlans } from '../../src/modules/narrative/narrative-planner.js';
import { createMockSources } from '../fixtures.js';
import { NarrativeType } from '../../src/domain/entities/narrative.js';

// ---------------------------------------------------------------------------
// Narrative Templates
// ---------------------------------------------------------------------------

describe('Narrative Templates', () => {
  it('has templates for all 10 narrative types', () => {
    const types = Object.values(NarrativeType);
    expect(types.length).toBe(10);

    for (const type of types) {
      expect(NARRATIVE_TEMPLATES[type]).toBeDefined();
      expect(NARRATIVE_TEMPLATES[type].beats.length).toBeGreaterThan(0);
    }
  });

  it('reel template has 5-7 beats', () => {
    const reel = NARRATIVE_TEMPLATES[NarrativeType.REEL_SHORT];
    expect(reel.beats.length).toBeGreaterThanOrEqual(5);
    expect(reel.beats.length).toBeLessThanOrEqual(7);
  });

  it('blog template has sections matching editorial flow', () => {
    const blog = NARRATIVE_TEMPLATES[NarrativeType.BLOG];
    expect(blog.beats.length).toBeGreaterThanOrEqual(5);

    // First beat should be HOOK
    expect(blog.beats[0].role).toBe('hook');
  });

  it('landing page template ends with CTA or CLOSING', () => {
    const lp = NARRATIVE_TEMPLATES[NarrativeType.LANDING_PAGE];
    const lastBeat = lp.beats[lp.beats.length - 1];
    expect(['cta', 'closing']).toContain(lastBeat.role);
  });
});

// ---------------------------------------------------------------------------
// Narrative Planner
// ---------------------------------------------------------------------------

describe('Narrative Planner', () => {
  it('generates narrative plans from sources', () => {
    const sources = createMockSources();
    const plans = generateNarrativePlans(sources);

    expect(plans.length).toBeGreaterThan(0);

    for (const plan of plans) {
      expect(plan.id).toBeDefined();
      expect(plan.narrativeType).toBeDefined();
      expect(plan.beats.length).toBeGreaterThan(0);
      expect(plan.confidence).toBeGreaterThanOrEqual(0);
      expect(plan.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('assigns targetFormat to each plan', () => {
    const sources = createMockSources();
    const plans = generateNarrativePlans(sources);

    for (const plan of plans) {
      expect(plan.targetFormat).toBeDefined();
    }
  });

  it('fills beats with source references', () => {
    const sources = createMockSources();
    const plans = generateNarrativePlans(sources);

    // At least some beats should have sourceId assigned
    const allBeats = plans.flatMap((p) => p.beats);
    const filledBeats = allBeats.filter((b) => b.sourceId);

    expect(filledBeats.length).toBeGreaterThan(0);
  });

  it('generates plans sorted by confidence descending', () => {
    const sources = createMockSources();
    const plans = generateNarrativePlans(sources);

    for (let i = 1; i < plans.length; i++) {
      expect(plans[i - 1].confidence).toBeGreaterThanOrEqual(plans[i].confidence);
    }
  });
});
