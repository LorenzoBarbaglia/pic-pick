import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_PRESET_ID, PRESETS, presetById } from './themes'
import type { VisualPreset } from './themes'
import { sound } from './sound'
import type { SoundVoice } from './sound'

const PRESET_KEY = 'picpick-preset'
const UI_KEY = 'picpick-ui'
const SEA_KEY = 'picpick-sea'
const TOOL_KEY = 'picpick-tools'

/**
 * Due personalità dell'app: «animato» è il rituale (mare, bolle che fluttuano,
 * personaggi, voci musicali); «ufficio» è lo strumento (barre di comandi
 * etichettati, niente scenografia, suoni asciutti). La palette del mondo vale
 * in entrambe: cambia il movimento, non l'identità.
 */
export type UiMode = 'animato' | 'ufficio'

/**
 * Quanto si vede lo sfondo. Alla luce del sole o su uno schermo poco contrastato
 * i punti tenui sparivano e con loro tutte le animazioni: qui si alza il volume
 * dello sfondo senza toccare i mondi.
 */
export type SeaVisibility = 'tenue' | 'normale' | 'marcato'

export const SEA_BOOST: Record<SeaVisibility, number> = {
  tenue: 0.7,
  normale: 1,
  marcato: 1.75
}

/**
 * Dimensione dei comandi nella colonna. «auto» la decide dall'altezza
 * disponibile: su un portatile piccolo i tredici comandi non ci stanno a
 * grandezza piena, e una colonna che scorre è peggio di una colonna compatta.
 */
export type ToolSize = 'auto' | 'grande' | 'media' | 'piccola'

export const TOOL_SIZE_PX: Record<Exclude<ToolSize, 'auto'>, number> = {
  grande: 48,
  media: 40,
  piccola: 32
}

/** voce sobria della modalità ufficio: conferme brevi, nessuna melodia */
const OFFICE_VOICE: SoundVoice = {
  waveform: 'sine',
  scale: [0, 7],
  rootHz: 440,
  reverbSeconds: 0.12,
  brightness: 3200,
  percussion: 'click',
  gain: 0.55
}

interface PresetContextValue {
  preset: VisualPreset
  presetId: string
  setPresetId: (id: string) => void
  /** passa al preset successivo (scorciatoia P) */
  cyclePreset: () => void
  uiMode: UiMode
  setUiMode: (mode: UiMode) => void
  toggleUiMode: () => void
  seaVisibility: SeaVisibility
  setSeaVisibility: (value: SeaVisibility) => void
  toolSize: ToolSize
  setToolSize: (value: ToolSize) => void
  /** moltiplicatore pronto da passare al mare */
  seaBoost: number
  /** vero in modalità animata: scorciatoia leggibile nei componenti */
  animated: boolean
  /** classi delle microinterazioni dei comandi, dettate dal mondo */
  toolMotionClass: string
}

const PresetContext = createContext<PresetContextValue | null>(null)

function readStored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // niente localStorage: la scelta resta valida per questa sessione
  }
}

export function PresetProvider({ children }: { children: ReactNode }) {
  const [presetId, setPresetIdState] = useState<string>(() => readStored(PRESET_KEY, DEFAULT_PRESET_ID))
  const [uiMode, setUiModeState] = useState<UiMode>(
    () => (readStored(UI_KEY, 'animato') === 'ufficio' ? 'ufficio' : 'animato')
  )
  const [seaVisibility, setSeaVisibilityState] = useState<SeaVisibility>(() => {
    const stored = readStored(SEA_KEY, 'normale')
    return stored === 'tenue' || stored === 'marcato' ? stored : 'normale'
  })
  const [toolSize, setToolSizeState] = useState<ToolSize>(() => {
    const stored = readStored(TOOL_KEY, 'auto')
    return stored === 'grande' || stored === 'media' || stored === 'piccola' ? stored : 'auto'
  })
  const preset = useMemo(() => presetById(presetId), [presetId])
  const animated = uiMode === 'animato'

  // le variabili CSS vanno sul documento: le usano anche body e overlay
  useEffect(() => {
    const root = document.documentElement
    for (const [name, value] of Object.entries(preset.vars)) {
      root.style.setProperty(name, value)
    }
    root.style.setProperty('--pp-press', String(animated ? preset.motion.press : 0.98))
    root.dataset.preset = preset.id
    root.dataset.ui = uiMode
    sound.setVoice(animated ? preset.voice : OFFICE_VOICE)
  }, [preset, animated, uiMode])

  const setPresetId = useCallback((id: string): void => {
    setPresetIdState(id)
    store(PRESET_KEY, id)
  }, [])

  const cyclePreset = useCallback((): void => {
    const index = PRESETS.findIndex((p) => p.id === presetId)
    setPresetId(PRESETS[(index + 1) % PRESETS.length].id)
  }, [presetId, setPresetId])

  const setUiMode = useCallback((mode: UiMode): void => {
    setUiModeState(mode)
    store(UI_KEY, mode)
  }, [])

  const toggleUiMode = useCallback((): void => {
    setUiMode(uiMode === 'animato' ? 'ufficio' : 'animato')
  }, [uiMode, setUiMode])

  const setSeaVisibility = useCallback((value: SeaVisibility): void => {
    setSeaVisibilityState(value)
    store(SEA_KEY, value)
  }, [])

  const setToolSize = useCallback((value: ToolSize): void => {
    setToolSizeState(value)
    store(TOOL_KEY, value)
  }, [])

  const toolMotionClass = animated ? `pp-tool pp-hover-${preset.motion.hover}` : 'pp-tool-flat'

  const value = useMemo(
    () => ({
      preset,
      presetId: preset.id,
      setPresetId,
      cyclePreset,
      uiMode,
      setUiMode,
      toggleUiMode,
      animated,
      toolMotionClass,
      seaVisibility,
      setSeaVisibility,
      seaBoost: SEA_BOOST[seaVisibility],
      toolSize,
      setToolSize
    }),
    [
      preset,
      setPresetId,
      cyclePreset,
      uiMode,
      setUiMode,
      toggleUiMode,
      animated,
      toolMotionClass,
      seaVisibility,
      setSeaVisibility,
      toolSize,
      setToolSize
    ]
  )

  return <PresetContext.Provider value={value}>{children}</PresetContext.Provider>
}

export function usePreset(): PresetContextValue {
  const value = useContext(PresetContext)
  if (!value) throw new Error('usePreset richiede PresetProvider')
  return value
}

/** durata di scena adattata al ritmo del mondo (in ufficio: quasi immediata) */
export function sceneMs(base: number, preset: VisualPreset, animated: boolean): number {
  if (!animated) return Math.min(120, base)
  return Math.round(base / preset.motion.speed)
}
