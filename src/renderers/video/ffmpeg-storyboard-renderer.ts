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

    // Map concatenated output
    args.push('-map', '[final]');

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

      // 2. Motion (Ken Burns / Pan-Scan generate frames via zoompan)
      //    Static frames need explicit duration via loop + trim
      const motion = this.buildMotion(frame);
      if (motion) {
        // zoompan outputs at 25fps by default; set s= for output resolution
        filters.push(motion + ':s=1080x1920:fps=30');
      } else {
        // Static: scale first, then generate frames for the duration
        const durationFrames = Math.round((frame.durationMs / 1000) * 30);
        filters.push(
          'scale=1080:1920:force_original_aspect_ratio=decrease,' +
            'pad=1080:1920:(ow-iw)/2:(oh-ih)/2,' +
            `loop=${durationFrames}:1:0,` +
            'setpts=N/30/TB',
        );
      }

      // 3. Scale for zoompan outputs (already 1080x1920 from zoompan s=)
      if (motion) {
        filters.push('setpts=N/30/TB');
      }

      parts.push(`${input}${filters.join(',')}[out${i}]`);
    }

    // Concat all processed streams into [final]
    const concatInputs = storyboard.frames.map((_, i) => `[out${i}]`).join('');
    parts.push(
      `${concatInputs}concat=n=${storyboard.frames.length}:v=1:a=0[final]`,
    );

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
