/**
 * Service: TTSSynthesisService
 *
 * Sintetiza um AudioPlan completo em arquivos de áudio reais usando um ITTSAdapter.
 * Cada segmento do plano é convertido em MP3 e salvo em storage.
 *
 * Resultado:
 * - Arquivos: storage/outputs/audio/{planId}/seg-{order:02d}-{role}.mp3
 * - Duração real calculada pela contagem de palavras
 *
 * Ativo somente quando TTS_SYNTHESIS_ENABLED=true e um adapter TTS está disponível.
 *
 * Uso:
 *   const service = new TTSSynthesisService();
 *   const result = await service.synthesizePlan(plan, ttsAdapter, 'storage/outputs/audio');
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AudioPlan } from '../domain/entities/audio-plan.js';
import type { ITTSAdapter } from '../domain/interfaces/tts-adapter.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SynthesizedSegment {
  /** Ordem na sequência (alinhado com AudioSegment.order) */
  order: number;

  /** Papel narrativo */
  role: string;

  /** Texto narrado */
  text: string;

  /** Caminho do arquivo de áudio gerado */
  filePath: string;

  /** Duração real em segundos */
  durationSeconds: number;

  /** Formato do arquivo */
  format: string;
}

export interface AudioSynthesisResult {
  /** ID do AudioPlan sintetizado */
  planId: string;

  /** Título do plano */
  title: string;

  /** Provider TTS usado */
  provider: string;

  /** Segmentos sintetizados com caminhos de arquivo */
  segments: SynthesizedSegment[];

  /** Total de arquivos gerados */
  totalFiles: number;

  /** Duração total real (soma dos segmentos) */
  totalDurationSeconds: number;

  /** Diretório de saída */
  outputDir: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TTSSynthesisService {
  /**
   * Sintetiza todos os segmentos de um AudioPlan usando o adapter TTS fornecido.
   * Salva os arquivos no diretório: {baseOutputDir}/{plan.id}/
   *
   * @param plan - Plano de áudio com segmentos e perfis de voz
   * @param adapter - Adapter TTS a usar (OpenAI, ElevenLabs, etc.)
   * @param baseOutputDir - Diretório base para salvar arquivos (default: storage/outputs/audio)
   */
  async synthesizePlan(
    plan: AudioPlan,
    adapter: ITTSAdapter,
    baseOutputDir: string = 'storage/outputs/audio',
  ): Promise<AudioSynthesisResult> {
    const outputDir = join(baseOutputDir, plan.id);

    // Criar diretório de saída
    await mkdir(outputDir, { recursive: true });

    logger.info(
      `[TTSSynthesis] Synthesizing plan "${plan.title}" ` +
      `(${plan.segments.length} segments, provider=${adapter.provider})`,
    );

    const synthesized: SynthesizedSegment[] = [];

    for (const segment of plan.segments) {
      // Pular segmentos sem texto
      if (!segment.text || segment.text.trim().length === 0) {
        logger.warn(`[TTSSynthesis] Skipping empty segment #${segment.order} (${segment.role})`);
        continue;
      }

      // Resolver voice ID: usa providerVoiceId do VoiceProfile se disponível
      const voice = plan.voices.find((v) => v.id === segment.speakerId);
      const voiceId = voice?.providerVoiceId ?? voice?.voiceType ?? undefined;

      const fileName = `seg-${String(segment.order).padStart(2, '0')}-${segment.role}.mp3`;
      const filePath = join(outputDir, fileName);

      try {
        logger.info(
          `[TTSSynthesis]   Segment #${segment.order} (${segment.role}): ` +
          `${segment.text.length} chars, voice=${voiceId ?? 'default'}`,
        );

        const result = await adapter.synthesize(segment.text, {
          voice: voiceId,
          speed: voice?.speed ?? 1.0,
          format: 'mp3',
        });

        await writeFile(filePath, result.audioBuffer);

        synthesized.push({
          order: segment.order,
          role: segment.role,
          text: segment.text,
          filePath,
          durationSeconds: result.durationSeconds,
          format: result.format,
        });

        logger.info(
          `[TTSSynthesis]   ✓ ${fileName} (${result.durationSeconds}s, ${result.audioBuffer.length} bytes)`,
        );
      } catch (err) {
        logger.warn(
          `[TTSSynthesis]   ✗ Segment #${segment.order} failed: ${err}. Skipping.`,
        );
        // Não interrompe — continua com os demais segmentos
      }
    }

    const totalDuration = synthesized.reduce((sum, s) => sum + s.durationSeconds, 0);

    const result: AudioSynthesisResult = {
      planId: plan.id,
      title: plan.title,
      provider: adapter.provider,
      segments: synthesized,
      totalFiles: synthesized.length,
      totalDurationSeconds: totalDuration,
      outputDir,
    };

    logger.info(
      `[TTSSynthesis] Done: ${synthesized.length}/${plan.segments.length} segments, ` +
      `${totalDuration}s total → ${outputDir}`,
    );

    return result;
  }

  /**
   * Verifica se a síntese TTS está habilitada via env var.
   * Controla se o AudioModule deve chamar síntese após gerar planos.
   */
  static isEnabled(): boolean {
    return process.env.TTS_SYNTHESIS_ENABLED === 'true';
  }
}
