/**
 * Audio Module
 *
 * Módulo de pipeline que gera AudioPlans a partir dos
 * MediaPlans e NarrativePlans do contexto.
 *
 * Stage: AUDIO_GENERATION (novo estágio, executado após personalization)
 * Ou pode ser executado standalone fora do pipeline.
 */

import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { PipelineStage } from '../../domain/value-objects/index.js';
import { buildAudioPlan, buildAudioOnlyPlan } from './audio-plan-builder.js';
import { generateMediaScript } from '../../generation/media-script-generator.js';
import type { AudioPlan, AudioGenerationResult } from '../../domain/entities/audio-plan.js';
import { NarrativeType, ToneOfVoice } from '../../domain/entities/narrative.js';

// Re-exports
export { buildAudioPlan, buildAudioOnlyPlan } from './audio-plan-builder.js';

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export class AudioModule implements IModule {
  readonly stage = PipelineStage.RENDER_EXPORT; // Runs alongside render export
  readonly name = 'Audio';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const mediaPlans = context.mediaPlans ?? [];
    const narratives = context.narratives ?? [];
    const plans: AudioPlan[] = [];

    // 1. Generate audio plans for media plans (voiceover)
    for (const mediaPlan of mediaPlans) {
      const narrative = narratives.find((n) => n.id === mediaPlan.narrativePlanId);
      const tone = narrative?.tone ?? ToneOfVoice.ASPIRACIONAL;

      // Generate script first
      const script = await generateMediaScript(mediaPlan, {
        mode: 'local',
        projectName: mediaPlan.title,
      });

      const audioPlan = buildAudioPlan(mediaPlan, script, tone);
      plans.push(audioPlan);

      console.log(
        `[INFO] ${new Date().toISOString()} [Audio] ${mediaPlan.format}: ` +
        `${audioPlan.segments.length} segments, ${audioPlan.totalDurationSeconds}s, ` +
        `mode=${audioPlan.narrationMode}, voice=${audioPlan.voices[0].voiceType}`,
      );
    }

    // 2. Generate audio plans for audio-only narratives (monologue, podcast)
    const audioNarratives = narratives.filter(
      (n) => n.narrativeType === NarrativeType.AUDIO_MONOLOGUE
        || n.narrativeType === NarrativeType.AUDIO_PODCAST,
    );

    for (const narrative of audioNarratives) {
      const projectName = narrative.title;
      const audioPlan = buildAudioOnlyPlan(narrative, projectName);
      plans.push(audioPlan);

      console.log(
        `[INFO] ${new Date().toISOString()} [Audio] ${narrative.narrativeType}: ` +
        `${audioPlan.segments.length} segments, ${audioPlan.totalDurationSeconds}s, ` +
        `mode=${audioPlan.narrationMode}, voices=${audioPlan.voices.length}`,
      );
    }

    const result: AudioGenerationResult = {
      plans,
      totalSegments: plans.reduce((sum, p) => sum + p.segments.length, 0),
      totalDurationSeconds: plans.reduce((sum, p) => sum + p.totalDurationSeconds, 0),
    };

    console.log(
      `[INFO] ${new Date().toISOString()} [Audio] Total: ${result.plans.length} audio plans, ` +
      `${result.totalSegments} segments, ${result.totalDurationSeconds}s`,
    );

    return {
      ...context,
      audioResult: result,
    };
  }
}
