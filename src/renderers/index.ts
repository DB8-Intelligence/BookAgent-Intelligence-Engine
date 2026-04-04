/**
 * Renderer Orchestrator
 *
 * Coordena a renderização rica de todos os planos do pipeline.
 * Transforma BlogPlan, LandingPagePlan e MediaPlan em outputs
 * polidos e inspecionáveis.
 *
 * Diferente do RenderExportModule (que serializa para ExportArtifact),
 * este orchestrator gera HTML rico, pronto para visualização humana.
 */

import type { BlogPlan } from '../domain/entities/blog-plan.js';
import type { LandingPagePlan } from '../domain/entities/landing-page-plan.js';
import type { MediaPlan } from '../domain/entities/media-plan.js';
import type { PersonalizationProfile } from '../domain/entities/personalization.js';

import { renderBlog, type BlogRenderResult } from './blog-renderer.js';
import { renderLandingPage, type LandingPageRenderResult } from './landing-page-renderer.js';
import { renderStoryboard, type StoryboardRenderResult } from './media-storyboard-renderer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RenderedOutput {
  blogs: BlogRenderOutput[];
  landingPages: LandingPageRenderOutput[];
  storyboards: StoryboardRenderOutput[];
  totalOutputs: number;
}

export interface BlogRenderOutput {
  planId: string;
  title: string;
  slug: string;
  result: BlogRenderResult;
}

export interface LandingPageRenderOutput {
  planId: string;
  title: string;
  slug: string;
  result: LandingPageRenderResult;
}

export interface StoryboardRenderOutput {
  planId: string;
  title: string;
  format: string;
  result: StoryboardRenderResult;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function renderAll(
  blogPlans: BlogPlan[],
  landingPagePlans: LandingPagePlan[],
  mediaPlans: MediaPlan[],
  personalization?: PersonalizationProfile,
): RenderedOutput {
  const blogs: BlogRenderOutput[] = blogPlans.map((plan) => ({
    planId: plan.id,
    title: plan.title,
    slug: plan.slug,
    result: renderBlog(plan, personalization),
  }));

  const landingPages: LandingPageRenderOutput[] = landingPagePlans.map((plan) => ({
    planId: plan.id,
    title: plan.title,
    slug: plan.slug,
    result: renderLandingPage(plan, personalization),
  }));

  const storyboards: StoryboardRenderOutput[] = mediaPlans.map((plan) => ({
    planId: plan.id,
    title: plan.title,
    format: plan.format,
    result: renderStoryboard(plan, personalization),
  }));

  return {
    blogs,
    landingPages,
    storyboards,
    totalOutputs: blogs.length + landingPages.length + storyboards.length,
  };
}

// Re-exports
export { renderBlog, type BlogRenderResult } from './blog-renderer.js';
export { renderLandingPage, type LandingPageRenderResult } from './landing-page-renderer.js';
export { renderStoryboard, type StoryboardRenderResult } from './media-storyboard-renderer.js';
