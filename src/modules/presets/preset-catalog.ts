/**
 * Preset Catalog — Built-in video presets
 *
 * Define os presets iniciais: luxury, corporate, fast-sales.
 * Cada preset é um conjunto completo de defaults visuais.
 *
 * Parte 63: Preset Engine
 */

import type { VideoPreset } from '../../domain/entities/video-preset.js';
import { MotionIntensity, TextStyle } from '../../domain/entities/video-preset.js';
import { MusicMood } from '../../domain/entities/music.js';

// ---------------------------------------------------------------------------
// Preset: Luxury
// ---------------------------------------------------------------------------

export const PRESET_LUXURY: VideoPreset = {
  id: 'luxury',
  name: 'Luxury',
  description: 'Elegante e sofisticado — ritmo lento, transições suaves, tipografia refinada',
  motion: {
    defaultSceneDuration: 5,
    intensity: MotionIntensity.SUBTLE,
    kenBurnsEnabled: true,
    kenBurnsZoomFactor: 1.04,
    panSpeed: 8,
  },
  transition: {
    defaultTransition: 'fade',
    transitionDuration: 0.8,
    allowedTransitions: ['fade', 'dissolve'],
    forceUniform: false,
  },
  textStyle: TextStyle.ELEGANT,
  defaultAudioMood: MusicMood.LUXURY,
  suggestedColors: {
    background: '#1a1a2e',
    text: '#f0e6d3',
    accent: '#c9a96e',
  },
  tags: ['aspiracional', 'alto-padrão', 'premium', 'luxury'],
};

// ---------------------------------------------------------------------------
// Preset: Corporate
// ---------------------------------------------------------------------------

export const PRESET_CORPORATE: VideoPreset = {
  id: 'corporate',
  name: 'Corporate',
  description: 'Profissional e institucional — ritmo moderado, transições limpas, texto minimalista',
  motion: {
    defaultSceneDuration: 4,
    intensity: MotionIntensity.SUBTLE,
    kenBurnsEnabled: false,
    kenBurnsZoomFactor: 1.0,
    panSpeed: 0,
  },
  transition: {
    defaultTransition: 'fade',
    transitionDuration: 0.5,
    allowedTransitions: ['fade', 'cut'],
    forceUniform: true,
  },
  textStyle: TextStyle.MINIMAL,
  defaultAudioMood: MusicMood.CORPORATE,
  suggestedColors: {
    background: '#ffffff',
    text: '#2c3e50',
    accent: '#3498db',
  },
  tags: ['institucional', 'corporativo', 'profissional', 'formal'],
};

// ---------------------------------------------------------------------------
// Preset: Fast Sales
// ---------------------------------------------------------------------------

export const PRESET_FAST_SALES: VideoPreset = {
  id: 'fast-sales',
  name: 'Fast Sales',
  description: 'Dinâmico e urgente — ritmo rápido, transições expressivas, texto impactante',
  motion: {
    defaultSceneDuration: 3,
    intensity: MotionIntensity.DYNAMIC,
    kenBurnsEnabled: true,
    kenBurnsZoomFactor: 1.08,
    panSpeed: 15,
  },
  transition: {
    defaultTransition: 'slide-left',
    transitionDuration: 0.3,
    allowedTransitions: ['cut', 'slide-left', 'slide-up', 'zoom-in'],
    forceUniform: false,
  },
  textStyle: TextStyle.IMPACT,
  defaultAudioMood: MusicMood.ENERGETIC,
  suggestedColors: {
    background: '#000000',
    text: '#ffffff',
    accent: '#ff4444',
  },
  tags: ['urgente', 'vendas', 'fast', 'dinâmico', 'reel'],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Todos os presets disponíveis, indexados por ID */
export const PRESET_REGISTRY: Record<string, VideoPreset> = {
  luxury: PRESET_LUXURY,
  corporate: PRESET_CORPORATE,
  'fast-sales': PRESET_FAST_SALES,
};

/** Lista de todos os presets */
export const ALL_PRESETS: VideoPreset[] = Object.values(PRESET_REGISTRY);
