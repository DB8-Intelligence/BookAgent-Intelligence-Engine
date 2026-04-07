/**
 * Music Selector — Background Music Engine
 *
 * Seleciona a trilha de fundo ideal com base no tipo de output,
 * narrativa e mood desejado.
 *
 * Fluxo:
 *   1. Recebe MusicProfile (mood, tempo, intensity)
 *   2. Filtra catálogo local (storage/music/)
 *   3. Pontua candidatas por match
 *   4. Retorna melhor trilha ou null (fallback sem música)
 *
 * Parte 62: Background Music Engine
 */

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { MusicTrack, MusicProfile } from '../../domain/entities/music.js';
import { MusicMood, MusicTempo, MusicIntensity } from '../../domain/entities/music.js';
import { SoundtrackCategory } from '../../domain/entities/audio-plan.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MUSIC_STORAGE_DIR = process.env.MUSIC_STORAGE_DIR ?? 'storage/music';

// ---------------------------------------------------------------------------
// Catalog — trilhas built-in por categoria
// ---------------------------------------------------------------------------

/**
 * Catálogo estático de trilhas disponíveis.
 * Em produção, isso pode ser carregado de um JSON ou banco de dados.
 * Por agora, define trilhas placeholder que o usuário popula em storage/music/.
 */
const BUILTIN_CATALOG: MusicTrack[] = [
  // Luxury
  {
    id: 'luxury-ambient-01',
    name: 'Luxury Ambient Piano',
    filePath: 'luxury/luxury-ambient-01.mp3',
    durationSeconds: 120,
    mood: MusicMood.LUXURY,
    tempo: MusicTempo.SLOW,
    intensity: MusicIntensity.LOW,
    tags: ['piano', 'ambient', 'elegant'],
    loopable: true,
  },
  {
    id: 'luxury-strings-01',
    name: 'Luxury Strings',
    filePath: 'luxury/luxury-strings-01.mp3',
    durationSeconds: 180,
    mood: MusicMood.LUXURY,
    tempo: MusicTempo.MODERATE,
    intensity: MusicIntensity.MEDIUM,
    tags: ['strings', 'orchestral', 'sophisticated'],
    loopable: true,
  },
  // Upbeat
  {
    id: 'upbeat-modern-01',
    name: 'Upbeat Modern Pop',
    filePath: 'upbeat/upbeat-modern-01.mp3',
    durationSeconds: 150,
    mood: MusicMood.UPBEAT,
    tempo: MusicTempo.FAST,
    intensity: MusicIntensity.MEDIUM,
    tags: ['pop', 'modern', 'positive'],
    loopable: true,
  },
  // Corporate
  {
    id: 'corporate-inspire-01',
    name: 'Corporate Inspirational',
    filePath: 'corporate/corporate-inspire-01.mp3',
    durationSeconds: 180,
    mood: MusicMood.CORPORATE,
    tempo: MusicTempo.MODERATE,
    intensity: MusicIntensity.LOW,
    tags: ['corporate', 'motivational', 'clean'],
    loopable: true,
  },
  // Emotional
  {
    id: 'emotional-piano-01',
    name: 'Emotional Piano Solo',
    filePath: 'emotional/emotional-piano-01.mp3',
    durationSeconds: 200,
    mood: MusicMood.EMOTIONAL,
    tempo: MusicTempo.SLOW,
    intensity: MusicIntensity.LOW,
    tags: ['piano', 'emotional', 'cinematic'],
    loopable: true,
  },
  // Energetic
  {
    id: 'energetic-drive-01',
    name: 'Energetic Drive',
    filePath: 'energetic/energetic-drive-01.mp3',
    durationSeconds: 120,
    mood: MusicMood.ENERGETIC,
    tempo: MusicTempo.FAST,
    intensity: MusicIntensity.HIGH,
    tags: ['electronic', 'energy', 'dynamic'],
    loopable: true,
  },
  // Chill
  {
    id: 'chill-lofi-01',
    name: 'Chill Lofi Beats',
    filePath: 'chill/chill-lofi-01.mp3',
    durationSeconds: 240,
    mood: MusicMood.CHILL,
    tempo: MusicTempo.SLOW,
    intensity: MusicIntensity.LOW,
    tags: ['lofi', 'chill', 'relax'],
    loopable: true,
  },
  // Dramatic
  {
    id: 'dramatic-cinematic-01',
    name: 'Dramatic Cinematic',
    filePath: 'dramatic/dramatic-cinematic-01.mp3',
    durationSeconds: 150,
    mood: MusicMood.DRAMATIC,
    tempo: MusicTempo.MODERATE,
    intensity: MusicIntensity.HIGH,
    tags: ['cinematic', 'dramatic', 'epic'],
    loopable: false,
  },
  // Minimal
  {
    id: 'minimal-ambient-01',
    name: 'Minimal Ambient Pad',
    filePath: 'minimal/minimal-ambient-01.mp3',
    durationSeconds: 300,
    mood: MusicMood.MINIMAL,
    tempo: MusicTempo.SLOW,
    intensity: MusicIntensity.LOW,
    tags: ['ambient', 'pad', 'texture'],
    loopable: true,
  },
];

// ---------------------------------------------------------------------------
// Soundtrack Category → MusicProfile mapping
// ---------------------------------------------------------------------------

/** Converte SoundtrackCategory (do AudioPlan) em MusicProfile para seleção */
export function profileFromSoundtrackCategory(category: SoundtrackCategory): MusicProfile | null {
  switch (category) {
    case SoundtrackCategory.NONE:
      return null;
    case SoundtrackCategory.AMBIENT_LUXURY:
      return { mood: MusicMood.LUXURY, tempo: MusicTempo.SLOW, intensity: MusicIntensity.LOW };
    case SoundtrackCategory.UPBEAT_MODERN:
      return { mood: MusicMood.UPBEAT, tempo: MusicTempo.FAST, intensity: MusicIntensity.MEDIUM };
    case SoundtrackCategory.CORPORATE:
      return { mood: MusicMood.CORPORATE, tempo: MusicTempo.MODERATE, intensity: MusicIntensity.LOW };
    case SoundtrackCategory.EMOTIONAL_PIANO:
      return { mood: MusicMood.EMOTIONAL, tempo: MusicTempo.SLOW, intensity: MusicIntensity.LOW };
    case SoundtrackCategory.ENERGETIC:
      return { mood: MusicMood.ENERGETIC, tempo: MusicTempo.FAST, intensity: MusicIntensity.HIGH };
    case SoundtrackCategory.CHILL_LOFI:
      return { mood: MusicMood.CHILL, tempo: MusicTempo.SLOW, intensity: MusicIntensity.LOW };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Selection API
// ---------------------------------------------------------------------------

/**
 * Seleciona a melhor trilha para um MusicProfile.
 * Retorna null se nenhuma trilha adequada for encontrada no disco.
 */
export async function selectTrack(profile: MusicProfile): Promise<MusicTrack | null> {
  // Filtrar catálogo por disponibilidade no disco
  const available = await getAvailableTracks();

  if (available.length === 0) {
    logger.info('[MusicSelector] No music tracks found in storage — skipping background music');
    return null;
  }

  // Pontuar cada trilha candidata
  const scored = available.map((track) => ({
    track,
    score: scoreTrack(track, profile),
  }));

  // Ordenar por score decrescente
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best.score <= 0) {
    logger.info(`[MusicSelector] No matching track for mood=${profile.mood} — skipping`);
    return null;
  }

  logger.info(
    `[MusicSelector] Selected "${best.track.name}" ` +
    `(score=${best.score}, mood=${best.track.mood}, tempo=${best.track.tempo})`,
  );

  return best.track;
}

/**
 * Resolve o caminho absoluto de uma trilha no disco.
 */
export function resolveTrackPath(track: MusicTrack): string {
  return join(MUSIC_STORAGE_DIR, track.filePath);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreTrack(track: MusicTrack, profile: MusicProfile): number {
  let score = 0;

  // Mood match (mais importante)
  if (track.mood === profile.mood) score += 10;
  else if (areSimilarMoods(track.mood, profile.mood)) score += 5;

  // Tempo match
  if (track.tempo === profile.tempo) score += 4;
  else if (areAdjacentTempos(track.tempo, profile.tempo)) score += 2;

  // Intensity match
  if (track.intensity === profile.intensity) score += 3;

  // Duração mínima
  if (profile.minDurationSeconds && track.durationSeconds < profile.minDurationSeconds) {
    if (!track.loopable) score -= 5; // Penaliza se curta e não loopável
  }

  // Preferência por loopáveis
  if (profile.preferLoopable && track.loopable) score += 2;

  return score;
}

function areSimilarMoods(a: MusicMood, b: MusicMood): boolean {
  const groups: MusicMood[][] = [
    [MusicMood.LUXURY, MusicMood.EMOTIONAL, MusicMood.MINIMAL],
    [MusicMood.UPBEAT, MusicMood.ENERGETIC],
    [MusicMood.CORPORATE, MusicMood.MINIMAL],
    [MusicMood.CHILL, MusicMood.MINIMAL, MusicMood.LUXURY],
  ];
  return groups.some((g) => g.includes(a) && g.includes(b));
}

function areAdjacentTempos(a: MusicTempo, b: MusicTempo): boolean {
  const order = [MusicTempo.SLOW, MusicTempo.MODERATE, MusicTempo.FAST];
  return Math.abs(order.indexOf(a) - order.indexOf(b)) === 1;
}

// ---------------------------------------------------------------------------
// Storage discovery
// ---------------------------------------------------------------------------

async function getAvailableTracks(): Promise<MusicTrack[]> {
  const available: MusicTrack[] = [];

  for (const track of BUILTIN_CATALOG) {
    const fullPath = resolveTrackPath(track);
    if (existsSync(fullPath)) {
      available.push(track);
    }
  }

  // Scan custom tracks from storage/music/custom/
  const customDir = join(MUSIC_STORAGE_DIR, 'custom');
  if (existsSync(customDir)) {
    try {
      const files = await readdir(customDir);
      for (const file of files) {
        if (file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.m4a')) {
          const customTrack: MusicTrack = {
            id: `custom-${file.replace(/\.[^.]+$/, '')}`,
            name: file.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
            filePath: `custom/${file}`,
            durationSeconds: 180, // Fallback — real duration parsed at mix time
            mood: MusicMood.MINIMAL,
            tempo: MusicTempo.MODERATE,
            intensity: MusicIntensity.LOW,
            tags: ['custom'],
            loopable: false,
          };
          available.push(customTrack);
        }
      }
    } catch {
      // Custom dir scan failed — ignore
    }
  }

  return available;
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export { BUILTIN_CATALOG };
