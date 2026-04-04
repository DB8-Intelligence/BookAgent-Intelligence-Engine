/**
 * Audio Module
 *
 * Módulo de pipeline que gera AudioPlans a partir dos
 * MediaPlans e NarrativePlans do contexto.
 *
 * Stage: RENDER_EXPORT (executa em paralelo com o render export)
 *
 * Fase 1 — Planejamento (sempre):
 *   Constrói AudioPlans estruturados com segmentos, perfis de voz e trilha.
 *
 * Fase 2 — Síntese TTS (quando TTS_SYNTHESIS_ENABLED=true e API key disponível):
 *   Sintetiza cada segmento em MP3 via ITTSAdapter.
 *   Salva arquivos em storage/outputs/audio/{planId}/
 *   Resulta em narração real pronta para uso.
 */

import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { PipelineStage } from '../../domain/value-objects/index.js';
import { logger } from '../../utils/logger.js';
import { buildAudioPlan, buildAudioOnlyPlan } from './audio-plan-builder.js';
import { generateMediaScript } from '../../generation/media-script-generator.js';
import type { AudioPlan, AudioGenerationResult } from '../../domain/entities/audio-plan.js';
import { NarrativeType, ToneOfVoice } from '../../domain/entities/narrative.js';
import { tryCreateTTSAdapter } from '../../adapters/provider-factory.js';
import { TTSSynthesisService } from '../../services/tts-synthesis-service.js';

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

    // 1. Gerar AudioPlans para MediaPlans (voiceover)
    for (const mediaPlan of mediaPlans) {
      const narrative = narratives.find((n) => n.id === mediaPlan.narrativePlanId);
      const tone = narrative?.tone ?? ToneOfVoice.ASPIRACIONAL;

      const script = await generateMediaScript(mediaPlan, {
        mode: 'local',
        projectName: mediaPlan.title,
      });

      const audioPlan = buildAudioPlan(mediaPlan, script, tone);
      plans.push(audioPlan);

      logger.info(
        `[Audio] ${mediaPlan.format}: ` +
        `${audioPlan.segments.length} segments, ${audioPlan.totalDurationSeconds}s, ` +
        `mode=${audioPlan.narrationMode}, voice=${audioPlan.voices[0].voiceType}`,
      );
    }

    // 2. Gerar AudioPlans para narrativas de áudio puro (monólogo, podcast)
    const audioNarratives = narratives.filter(
      (n) => n.narrativeType === NarrativeType.AUDIO_MONOLOGUE
        || n.narrativeType === NarrativeType.AUDIO_PODCAST,
    );

    for (const narrative of audioNarratives) {
      const projectName = narrative.title;
      const audioPlan = buildAudioOnlyPlan(narrative, projectName);
      plans.push(audioPlan);

      logger.info(
        `[Audio] ${narrative.narrativeType}: ` +
        `${audioPlan.segments.length} segments, ${audioPlan.totalDurationSeconds}s, ` +
        `mode=${audioPlan.narrationMode}, voices=${audioPlan.voices.length}`,
      );
    }

    const result: AudioGenerationResult = {
      plans,
      totalSegments: plans.reduce((sum, p) => sum + p.segments.length, 0),
      totalDurationSeconds: plans.reduce((sum, p) => sum + p.totalDurationSeconds, 0),
    };

    logger.info(
      `[Audio] Total: ${result.plans.length} audio plans, ` +
      `${result.totalSegments} segments, ${result.totalDurationSeconds}s`,
    );

    // 3. Síntese TTS real (opcional — ativa somente com TTS_SYNTHESIS_ENABLED=true)
    if (TTSSynthesisService.isEnabled() && plans.length > 0) {
      await this.synthesizePlans(plans);
    } else if (plans.length > 0) {
      logger.info(
        '[Audio] TTS synthesis skipped (set TTS_SYNTHESIS_ENABLED=true to activate)',
      );
    }

    return {
      ...context,
      audioResult: result,
    };
  }

  // ---------------------------------------------------------------------------
  // TTS Synthesis
  // ---------------------------------------------------------------------------

  private async synthesizePlans(plans: AudioPlan[]): Promise<void> {
    const ttsAdapter = tryCreateTTSAdapter();

    if (!ttsAdapter) {
      logger.warn(
        '[Audio] TTS_SYNTHESIS_ENABLED=true but no TTS API key found. ' +
        'Set OPENAI_API_KEY (for openai-tts) or ELEVENLABS_API_KEY (for elevenlabs).',
      );
      return;
    }

    const synthesizer = new TTSSynthesisService();
    const outputBase = process.env.OUTPUTS_DIR
      ? `${process.env.OUTPUTS_DIR}/audio`
      : 'storage/outputs/audio';

    logger.info(
      `[Audio] Starting TTS synthesis: ${plans.length} plans, ` +
      `provider=${ttsAdapter.provider}, output=${outputBase}`,
    );

    for (const plan of plans) {
      try {
        const result = await synthesizer.synthesizePlan(plan, ttsAdapter, outputBase);
        logger.info(
          `[Audio] ✓ Synthesized "${plan.title}": ` +
          `${result.totalFiles} files, ${result.totalDurationSeconds}s → ${result.outputDir}`,
        );
      } catch (err) {
        logger.warn(`[Audio] Synthesis failed for "${plan.title}": ${err}`);
        // Não interrompe o pipeline — continua com os demais planos
      }
    }
  }
}
