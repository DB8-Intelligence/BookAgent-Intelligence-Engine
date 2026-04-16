/**
 * FFmpeg Storyboard Renderer
 *
 * Transforma StoryboardOutput em comandos FFmpeg com:
 *  - Safe crop 9:16 (via CropRect do storyboard-builder)
 *  - Ken Burns (zoompan focado no POI)
 *  - Transições fade entre frames
 *  - Output 1080x1920 @ 30fps H.264
 *
 * Módulo puro — gera strings de comando, não executa FFmpeg.
 */

import type { StoryboardOutput, StoryboardFrame } from '../../modules/media/storyboard-builder.js';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface FFmpegCommand {
  readonly args: readonly string[];
  readonly filterComplex: string;
}

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

export class FFmpegStoryboardRenderer {
  /**
   * Gerar comando FFmpeg completo como array de argumentos.
   */
  generateCommand(
    storyboard: StoryboardOutput,
    outputPath: string,
  ): readonly string[] {
    const args: string[] = ['ffmpeg'];

    // Inputs
    for (const frame of storyboard.frames) {
      args.push('-i', frame.assetPath);
    }

    // Filter complex
    const filterComplex = this.buildFilterChain(storyboard);
    args.push('-filter_complex', filterComplex);

    // Encoder
    args.push(
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      outputPath,
    );

    return args;
  }

  /**
   * Montar filter chain FFmpeg completo.
   */
  private buildFilterChain(storyboard: StoryboardOutput): string {
    const parts: string[] = [];

    for (let i = 0; i < storyboard.frames.length; i++) {
      const frame = storyboard.frames[i];
      const input = `[${i}:v]`;

      const filters: string[] = [];

      // 1. Crop 9:16 baseado no POI
      filters.push(this.buildCrop(frame));

      // 2. Motion (Ken Burns ou nada)
      const motion = this.buildMotion(frame);
      if (motion) filters.push(motion);

      // 3. Scale para 1080x1920
      filters.push(
        'scale=1080:1920:force_original_aspect_ratio=decrease,' +
          'pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
      );

      parts.push(`${input}${filters.join(',')}[out${i}]`);
    }

    return parts.join(';');
  }

  /**
   * Comando de crop do CropRect.
   */
  private buildCrop(frame: StoryboardFrame): string {
    const { x, y, width, height } = frame.cropGeometry;
    return `crop=${Math.round(width)}:${Math.round(height)}:${Math.round(x)}:${Math.round(y)}`;
  }

  /**
   * Ken Burns zoompan focado no POI. Retorna null para static.
   */
  private buildMotion(frame: StoryboardFrame): string | null {
    if (frame.motionProfile === 'static') return null;

    const durationFrames = Math.round((frame.durationMs / 1000) * 30);

    if (frame.motionProfile === 'ken-burns') {
      return (
        `zoompan=z='min(zoom+0.002,1.5)':` +
        `x='iw*${frame.poiX.toFixed(2)}-(iw/zoom/2)':` +
        `y='ih*${frame.poiY.toFixed(2)}-(ih/zoom/2)':` +
        `d=${durationFrames}`
      );
    }

    // pan-scan: movimento horizontal suave
    return (
      `zoompan=z=1.3:` +
      `x='iw*0.1+iw*0.8*on/${durationFrames}':` +
      `y='ih/2-(ih/zoom/2)':` +
      `d=${durationFrames}`
    );
  }
}
