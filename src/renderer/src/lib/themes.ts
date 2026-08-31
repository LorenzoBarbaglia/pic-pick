import type { SoundVoice } from './sound'

/**
 * Preset visivi: ogni preset è un "mondo" con la sua palette, il suo mare, le
 * sue bolle, il ritmo delle animazioni e la sua voce musicale. Le parti
 * dichiarative vanno in variabili CSS (applicate al documento), i parametri
 * fisici del mare e delle bolle restano numeri letti dai componenti che li
 * animano, e la voce va al motore audio.
 */

export interface SeaParams {
  /** distanza tra i punti del mare in px: fitto o rado */
  spacing: number
  /** colore base dei punti, prima che l'album lo faccia virare */
  baseColor: { r: number; g: number; b: number }
  /** quanto l'album può tingere il mare (0-1) */
  maxTint: number
  /** forma dei punti */
  shape: 'circle' | 'square' | 'diamond'
  /** raggio minimo e ampiezza dell'oscillazione */
  dotBase: number
  dotAmp: number
  /** velocità di scorrimento dell'onda e sua lunghezza */
  waveSpeed: number
  waveFrequency: number
  /** deriva dei punti lungo la direzione dell'onda */
  swayPx: number
  /** ogni quanto il mare vira, e di quanto */
  directionChangeMs: number
  directionSwing: number
  /** goccia al click: velocità del fronte, spessore, durata, spinta */
  rippleSpeed: number
  rippleWidth: number
  rippleLifeS: number
  rippleAmp: number
  ripplePush: number
  /** opacità massima dei punti */
  maxAlpha: number
  /** vita propria dello sfondo, oltre all'onda */
  ambient: 'none' | 'comet' | 'sparks' | 'drift'
  /** come il fondo reagisce al passaggio del puntatore */
  hover: {
    /** raggio d'influenza in px */
    radius: number
    /** di quanto crescono i punti sotto il puntatore */
    lift: number
    /** opacità in più: è questa che rende la reazione visibile */
    glow: number
    /** quante posizioni passate lasciano scia (0 = nessuna) */
    trail: number
    /** alone luminoso attorno al puntatore (0 = nessuno) */
    halo: number
    /** il movimento accende scintille */
    sparks: boolean
  }
}

/** che cosa sono, fisicamente, le bolle di questo mondo */
export type BubbleStyle = 'soap' | 'lantern' | 'ember' | 'drop'
/** come si disfano quando le si sceglie */
export type PopStyle = 'droplets' | 'ripple' | 'sparks' | 'ink'

export interface BubbleParams {
  style: BubbleStyle
  pop: PopStyle
  /** durata base del morphing della forma (secondi) */
  wobbleSeconds: number
  /** nome dei keyframes che deformano la bolla */
  wobbleAnimation: string
  /** iridescenza / alone: gradiente, opacità e durata della deriva */
  sheenGradient: string
  sheenOpacity: number
  sheenSeconds: number
  /** alone esterno in px (0 = nessuno) */
  glowPx: number
  /** velocità di crociera e dissipazione a ogni rimbalzo */
  cruiseSpeed: number
  bounceDamping: number
  /** squash & stretch all'urto */
  squash: number
  stretch: number
  /** sfocatura del vetro della bolla */
  blurPx: number
}

/** come si muovono i comandi in questo mondo */
export interface MotionParams {
  /** microinterazione al passaggio del puntatore */
  hover: 'lift' | 'glow' | 'jitter' | 'settle'
  /** scala alla pressione */
  press: number
  /** moltiplicatore delle durate delle animazioni di scena (>1 = più svelto) */
  speed: number
}

export interface VisualPreset {
  id: string
  label: string
  /** una riga che racconta il mondo, mostrata nel setup */
  hint: string
  /** anteprima nel setup: colori del campione */
  swatch: { bg: string; sea: string; accent: string }
  /** variabili CSS applicate a document.documentElement */
  vars: Record<string, string>
  sea: SeaParams
  bubbles: BubbleParams
  motion: MotionParams
  /** come entra in scena ogni nuova foto */
  photoEnter: { animation: string; durationMs: number }
  voice: SoundVoice
}

export const PRESETS: VisualPreset[] = [
  {
    id: 'mare',
    label: 'Mare',
    hint: 'Sabbia calda e ambra, onde lente, bolle di sapone: il mondo di casa.',
    swatch: { bg: '#12100e', sea: '#d6b280', accent: '#fbbf24' },
    vars: {
      '--pp-accent': '#fbbf24',
      '--pp-accent-hover': '#fcd34d',
      '--pp-accent-rgb': '251, 191, 36',
      '--pp-on-accent': '#1c1917',
      '--pp-bg': '#0c0a09',
      '--pp-stage': 'rgb(18, 16, 14)',
      '--pp-veil': 'rgba(18, 16, 14, 0.55)',
      '--pp-panel': 'rgba(255, 255, 255, 0.05)',
      '--pp-ink': '#e7e5e4',
      '--pp-ink-dim': '#a8a29e',
      '--pp-surface': 'rgba(12, 10, 9, 0.88)',
      '--pp-scrim': 'rgba(0, 0, 0, 0.62)',
      '--pp-ink-strong': '#ffffff',
      '--pp-line-strong': 'rgba(255, 255, 255, 0.40)',
      '--pp-line': 'rgba(255, 255, 255, 0.10)',
      '--pp-radius': '8px',
      '--pp-radius-lg': '12px',
      '--pp-ease': 'cubic-bezier(0.34, 1.56, 0.64, 1)'
    },
    sea: {
      spacing: 16,
      baseColor: { r: 214, g: 178, b: 128 },
      maxTint: 0.55,
      shape: 'circle',
      dotBase: 0.9,
      dotAmp: 1.25,
      waveSpeed: 1.15,
      waveFrequency: 0.05,
      swayPx: 7,
      directionChangeMs: 11000,
      directionSwing: 0.4,
      rippleSpeed: 230,
      rippleWidth: 34,
      rippleLifeS: 6,
      rippleAmp: 2.6,
      ripplePush: 7,
      maxAlpha: 0.8,
      ambient: 'none',
      hover: { radius: 130, lift: 1.8, glow: 0.16, trail: 9, halo: 0, sparks: false }
    },
    bubbles: {
      style: 'soap',
      pop: 'droplets',
      wobbleSeconds: 4,
      wobbleAnimation: 'bubble-wobble',
      sheenGradient:
        'conic-gradient(from 210deg, rgba(255, 0, 200, 0.5), rgba(0, 220, 255, 0.5), rgba(255, 240, 0, 0.4), rgba(120, 0, 255, 0.5), rgba(255, 0, 200, 0.5))',
      sheenOpacity: 0.3,
      sheenSeconds: 7,
      glowPx: 0,
      cruiseSpeed: 70,
      bounceDamping: 0.35,
      squash: 0.82,
      stretch: 1.14,
      blurPx: 2
    },
    motion: { hover: 'lift', press: 0.94, speed: 1 },
    photoEnter: { animation: 'photo-tide', durationMs: 520 },
    voice: {
      waveform: 'sine',
      scale: [0, 2, 4, 7, 9],
      rootHz: 262,
      reverbSeconds: 1.8,
      brightness: 5200,
      percussion: 'splash',
      gain: 1
    }
  },
  {
    id: 'notte',
    label: 'Notte',
    hint: 'Indaco profondo, stelle fitte, lanterne che pulsano: tutto rallenta.',
    swatch: { bg: '#07080f', sea: '#6f86c8', accent: '#a5b4fc' },
    vars: {
      '--pp-accent': '#a5b4fc',
      '--pp-accent-hover': '#c7d2fe',
      '--pp-accent-rgb': '165, 180, 252',
      '--pp-on-accent': '#0b1020',
      '--pp-bg': '#06070d',
      '--pp-stage': 'rgb(8, 10, 20)',
      '--pp-veil': 'rgba(6, 8, 18, 0.62)',
      '--pp-panel': 'rgba(148, 163, 255, 0.06)',
      '--pp-ink': '#e7e5e4',
      '--pp-ink-dim': '#a8a29e',
      '--pp-surface': 'rgba(12, 10, 9, 0.88)',
      '--pp-scrim': 'rgba(0, 0, 0, 0.62)',
      '--pp-ink-strong': '#ffffff',
      '--pp-line-strong': 'rgba(255, 255, 255, 0.40)',
      '--pp-line': 'rgba(165, 180, 252, 0.14)',
      '--pp-radius': '14px',
      '--pp-radius-lg': '20px',
      '--pp-ease': 'cubic-bezier(0.22, 1, 0.36, 1)'
    },
    sea: {
      spacing: 11,
      baseColor: { r: 111, g: 134, b: 200 },
      maxTint: 0.4,
      shape: 'circle',
      dotBase: 0.5,
      dotAmp: 0.85,
      waveSpeed: 0.32,
      waveFrequency: 0.028,
      swayPx: 5,
      directionChangeMs: 24000,
      directionSwing: 0.15,
      rippleSpeed: 130,
      rippleWidth: 58,
      rippleLifeS: 10,
      rippleAmp: 3,
      ripplePush: 9,
      maxAlpha: 0.9,
      ambient: 'comet',
      hover: { radius: 165, lift: 1.0, glow: 0.34, trail: 5, halo: 0.55, sparks: false }
    },
    bubbles: {
      style: 'lantern',
      pop: 'ripple',
      wobbleSeconds: 6.5,
      wobbleAnimation: 'bubble-breathe',
      sheenGradient:
        'radial-gradient(circle at 50% 50%, rgba(255, 245, 200, 0.55), rgba(160, 180, 255, 0.25) 55%, rgba(60, 80, 200, 0) 80%)',
      sheenOpacity: 0.75,
      sheenSeconds: 5,
      glowPx: 42,
      cruiseSpeed: 46,
      bounceDamping: 0.5,
      squash: 0.9,
      stretch: 1.07,
      blurPx: 1
    },
    motion: { hover: 'glow', press: 0.97, speed: 0.5 },
    photoEnter: { animation: 'photo-dawn', durationMs: 1150 },
    voice: {
      waveform: 'triangle',
      scale: [0, 3, 5, 7, 10],
      rootHz: 196,
      reverbSeconds: 3.8,
      brightness: 2600,
      percussion: 'dust',
      gain: 0.9
    }
  },
  {
    id: 'brace',
    label: 'Brace',
    hint: 'Nero e arancio incandescente, rombi, braci che tremolano e scintille.',
    swatch: { bg: '#0a0503', sea: '#c85a28', accent: '#f97316' },
    vars: {
      '--pp-accent': '#f97316',
      '--pp-accent-hover': '#fb923c',
      '--pp-accent-rgb': '249, 115, 22',
      '--pp-on-accent': '#180a02',
      '--pp-bg': '#0a0503',
      '--pp-stage': 'rgb(14, 8, 5)',
      '--pp-veil': 'rgba(10, 5, 3, 0.6)',
      '--pp-panel': 'rgba(249, 115, 22, 0.07)',
      '--pp-ink': '#e7e5e4',
      '--pp-ink-dim': '#a8a29e',
      '--pp-surface': 'rgba(12, 10, 9, 0.88)',
      '--pp-scrim': 'rgba(0, 0, 0, 0.62)',
      '--pp-ink-strong': '#ffffff',
      '--pp-line-strong': 'rgba(255, 255, 255, 0.40)',
      '--pp-line': 'rgba(249, 115, 22, 0.18)',
      '--pp-radius': '3px',
      '--pp-radius-lg': '4px',
      '--pp-ease': 'cubic-bezier(0.16, 1.4, 0.3, 1)'
    },
    sea: {
      spacing: 19,
      baseColor: { r: 200, g: 90, b: 40 },
      maxTint: 0.45,
      shape: 'diamond',
      dotBase: 0.7,
      dotAmp: 2,
      waveSpeed: 2.7,
      waveFrequency: 0.075,
      swayPx: 3,
      directionChangeMs: 4200,
      directionSwing: 0.9,
      rippleSpeed: 360,
      rippleWidth: 22,
      rippleLifeS: 3.5,
      rippleAmp: 3.4,
      ripplePush: 5,
      maxAlpha: 0.75,
      ambient: 'sparks',
      hover: { radius: 105, lift: 2.4, glow: 0.22, trail: 3, halo: 0.3, sparks: true }
    },
    bubbles: {
      style: 'ember',
      pop: 'sparks',
      wobbleSeconds: 2.6,
      wobbleAnimation: 'bubble-flicker',
      sheenGradient:
        'radial-gradient(circle at 50% 62%, rgba(255, 230, 120, 0.85), rgba(255, 120, 20, 0.5) 45%, rgba(120, 20, 0, 0) 78%)',
      sheenOpacity: 0.8,
      sheenSeconds: 1.6,
      glowPx: 30,
      cruiseSpeed: 105,
      bounceDamping: 0.22,
      squash: 0.74,
      stretch: 1.22,
      blurPx: 0
    },
    motion: { hover: 'jitter', press: 0.88, speed: 2 },
    photoEnter: { animation: 'photo-flash', durationMs: 240 },
    voice: {
      waveform: 'sawtooth',
      scale: [0, 3, 5, 6, 7, 10],
      rootHz: 330,
      reverbSeconds: 0.4,
      brightness: 3400,
      percussion: 'click',
      gain: 0.75
    }
  },
  {
    id: 'camera',
    label: 'Camera oscura',
    hint: 'Luce rossa di sicurezza, punti radi, gocce di sviluppo, silenzio.',
    swatch: { bg: '#0b0708', sea: '#a33b3b', accent: '#ef4444' },
    vars: {
      '--pp-accent': '#ef4444',
      '--pp-accent-hover': '#f87171',
      '--pp-accent-rgb': '239, 68, 68',
      '--pp-on-accent': '#1a0505',
      '--pp-bg': '#0b0708',
      '--pp-stage': 'rgb(13, 9, 10)',
      '--pp-veil': 'rgba(11, 7, 8, 0.68)',
      '--pp-panel': 'rgba(239, 68, 68, 0.06)',
      '--pp-ink': '#e7e5e4',
      '--pp-ink-dim': '#a8a29e',
      '--pp-surface': 'rgba(12, 10, 9, 0.88)',
      '--pp-scrim': 'rgba(0, 0, 0, 0.62)',
      '--pp-ink-strong': '#ffffff',
      '--pp-line-strong': 'rgba(255, 255, 255, 0.40)',
      '--pp-line': 'rgba(239, 68, 68, 0.16)',
      '--pp-radius': '2px',
      '--pp-radius-lg': '2px',
      '--pp-ease': 'cubic-bezier(0.4, 0, 0.2, 1)'
    },
    sea: {
      spacing: 28,
      baseColor: { r: 163, g: 59, b: 59 },
      maxTint: 0.3,
      shape: 'square',
      dotBase: 1.2,
      dotAmp: 0.6,
      waveSpeed: 0.22,
      waveFrequency: 0.04,
      swayPx: 2,
      directionChangeMs: 30000,
      directionSwing: 0.1,
      rippleSpeed: 170,
      rippleWidth: 44,
      rippleLifeS: 8,
      rippleAmp: 1.9,
      ripplePush: 4,
      maxAlpha: 0.66,
      ambient: 'drift',
      hover: { radius: 150, lift: 1.5, glow: 0.26, trail: 14, halo: 0.18, sparks: false }
    },
    bubbles: {
      style: 'drop',
      pop: 'ink',
      wobbleSeconds: 9,
      wobbleAnimation: 'bubble-sag',
      sheenGradient:
        'radial-gradient(circle at 42% 30%, rgba(255, 255, 255, 0.30), rgba(255, 90, 90, 0.10) 60%, rgba(0, 0, 0, 0) 85%)',
      sheenOpacity: 0.5,
      sheenSeconds: 14,
      glowPx: 14,
      cruiseSpeed: 34,
      bounceDamping: 0.6,
      squash: 0.92,
      stretch: 1.06,
      blurPx: 4
    },
    motion: { hover: 'settle', press: 0.98, speed: 0.75 },
    photoEnter: { animation: 'photo-develop', durationMs: 1500 },
    voice: {
      waveform: 'sine',
      scale: [0, 5, 7, 12],
      rootHz: 147,
      reverbSeconds: 5,
      brightness: 1800,
      percussion: 'thud',
      gain: 0.85
    }
  },
  {
    id: 'carta',
    label: 'Carta',
    hint: 'Luce di giorno su carta neutra: il contorno chiaro con cui si giudicano le stampe.',
    swatch: { bg: '#e9e6df', sea: '#8c8478', accent: '#b4552d' },
    vars: {
      '--pp-accent': '#b4552d',
      '--pp-accent-hover': '#c9663a',
      '--pp-accent-rgb': '180, 85, 45',
      '--pp-on-accent': '#fdf9f2',
      '--pp-bg': '#efece5',
      '--pp-stage': 'rgb(226, 222, 213)',
      // il velo fuori dal riquadro SCHIARISCE invece di scurire: su fondo
      // chiaro è così che una zona si allontana
      '--pp-veil': 'rgba(243, 241, 235, 0.62)',
      '--pp-panel': 'rgba(60, 50, 40, 0.05)',
      '--pp-ink': '#2c2a26',
      '--pp-ink-dim': '#6b665e',
      '--pp-surface': 'rgba(247, 245, 240, 0.94)',
      '--pp-scrim': 'rgba(236, 232, 224, 0.82)',
      '--pp-ink-strong': '#141310',
      '--pp-line-strong': 'rgba(0, 0, 0, 0.32)',
      '--pp-line': 'rgba(0, 0, 0, 0.13)',
      '--pp-radius': '10px',
      '--pp-radius-lg': '14px',
      '--pp-ease': 'cubic-bezier(0.22, 1, 0.36, 1)'
    },
    sea: {
      spacing: 19,
      // sul chiaro i punti devono essere più SCURI del fondo
      baseColor: { r: 124, g: 114, b: 100 },
      maxTint: 0.4,
      shape: 'circle',
      dotBase: 0.85,
      dotAmp: 1,
      waveSpeed: 0.75,
      waveFrequency: 0.045,
      swayPx: 5,
      directionChangeMs: 14000,
      directionSwing: 0.3,
      rippleSpeed: 200,
      rippleWidth: 30,
      rippleLifeS: 5.5,
      rippleAmp: 1.9,
      ripplePush: 5,
      maxAlpha: 0.32,
      ambient: 'none',
      hover: { radius: 120, lift: 1.4, glow: 0.1, trail: 7, halo: 0, sparks: false }
    },
    bubbles: {
      // opache come gocce di colore sulla carta: su fondo chiaro il sapone
      // iridescente si perderebbe
      style: 'drop',
      pop: 'ripple',
      wobbleSeconds: 5,
      wobbleAnimation: 'bubble-wobble',
      sheenGradient:
        'radial-gradient(circle at 38% 32%, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0) 60%)',
      sheenOpacity: 0.35,
      sheenSeconds: 9,
      glowPx: 0,
      cruiseSpeed: 58,
      bounceDamping: 0.3,
      squash: 0.88,
      stretch: 1.08,
      blurPx: 0
    },
    motion: { hover: 'lift', press: 0.96, speed: 0.9 },
    photoEnter: { animation: 'photo-dawn', durationMs: 620 },
    voice: {
      waveform: 'triangle',
      scale: [0, 2, 4, 7, 9],
      rootHz: 294,
      reverbSeconds: 0.7,
      brightness: 4200,
      percussion: 'click',
      gain: 0.9
    }
  }
]

export const DEFAULT_PRESET_ID = PRESETS[0].id

export function presetById(id: string | undefined): VisualPreset {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0]
}
