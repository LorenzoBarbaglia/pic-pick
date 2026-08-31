/**
 * Sviluppo dell'immagine: i parametri, i look e i due strati di stampa.
 *
 * I numeri sono nella scala dei fotografi (-100..+100, o 0..100 per gli effetti
 * additivi): gli stessi che si scambiano nelle community di preset. Il calcolo
 * vero avviene sulla GPU in `developGl.ts`, in luce lineare e con roll-off delle
 * alte luci — vignettatura e grana restano due strati sopra l'immagine.
 */

export type BwFilter = 'neutral' | 'yellow' | 'orange' | 'red' | 'green'

export interface Develop {
  /** luminosità in stop (±100 ≈ ±1.35 stop) */
  exposure: number
  /** contrasto LOCALE: il micro-contrasto dei mezzitoni (clarity) */
  clarity: number
  /** acutanza sui bordi fini: la nitidezza vera, con maschera sul piatto */
  sharpness: number
  /** guadagno in log attorno al grigio medio */
  contrast: number
  /** recupero (−) o spinta (+) delle alte luci */
  highlights: number
  /** apertura (+) o chiusura (−) delle ombre */
  shadows: number
  whites: number
  blacks: number
  /** temperatura colore: freddo (−) o caldo (+) */
  temperature: number
  /** tinta: verde (−) o magenta (+) */
  tint: number
  /** vividezza: satura i colori tenui e risparmia gli incarnati */
  vibrance: number
  /** saturazione piatta, da usare con parsimonia */
  saturation: number
  /** fasce di colore che contano davvero in fotografia */
  skinSat: number
  skinLum: number
  skySat: number
  skyLum: number
  greenSat: number
  greenLum: number
  /** viraggio a tre vie: ombre, mezzitoni, luci (tinta in gradi + intensità) */
  gradeLowHue: number
  gradeLowSat: number
  gradeMidHue: number
  gradeMidSat: number
  gradeHighHue: number
  gradeHighSat: number
  /** neri alzati: il look matte della stampa */
  fade: number
  /** buio verso i bordi e sua morbidezza */
  vignette: number
  vignetteFeather: number
  /** grana della pellicola: quantità e dimensione del granulo */
  grain: number
  grainSize: number
  /** bianco e nero, con il filtro colore che si usava sulla pellicola */
  bw: boolean
  bwFilter: BwFilter
  /** LUT creativo importato (nome del file .cube); vuoto = nessuno */
  lutName: string
  /** quanto pesa il LUT sopra il resto dello sviluppo */
  lutAmount: number
}

export const NEUTRAL_DEVELOP: Develop = {
  exposure: 0,
  clarity: 0,
  sharpness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  skinSat: 0,
  skinLum: 0,
  skySat: 0,
  skyLum: 0,
  greenSat: 0,
  greenLum: 0,
  gradeLowHue: 210,
  gradeLowSat: 0,
  gradeMidHue: 40,
  gradeMidSat: 0,
  gradeHighHue: 40,
  gradeHighSat: 0,
  fade: 0,
  vignette: 0,
  vignetteFeather: 50,
  grain: 0,
  grainSize: 40,
  bw: false,
  bwFilter: 'neutral',
  lutName: '',
  lutAmount: 100
}

/**
 * Pesi dei canali per il bianco e nero: sono i filtri che si montavano davanti
 * all'obiettivo con la pellicola. Il giallo scurisce il cielo, il rosso lo rende
 * drammatico, il verde apre gli incarnati.
 */
export const BW_FILTERS: Record<BwFilter, [number, number, number]> = {
  neutral: [0.2126, 0.7152, 0.0722],
  yellow: [0.3, 0.6, 0.1],
  orange: [0.45, 0.48, 0.07],
  red: [0.62, 0.33, 0.05],
  green: [0.2, 0.68, 0.12]
}

export const BW_FILTER_LABELS: Record<BwFilter, string> = {
  neutral: 'Neutro',
  yellow: 'Giallo',
  orange: 'Arancio',
  red: 'Rosso',
  green: 'Verde'
}

/** i campi numerici, per medie e confronti automatici */
export const NUMERIC_KEYS = [
  'exposure',
  'clarity',
  'sharpness',
  'contrast',
  'highlights',
  'shadows',
  'whites',
  'blacks',
  'temperature',
  'tint',
  'vibrance',
  'saturation',
  'skinSat',
  'skinLum',
  'skySat',
  'skyLum',
  'greenSat',
  'greenLum',
  'gradeLowHue',
  'gradeLowSat',
  'gradeMidHue',
  'gradeMidSat',
  'gradeHighHue',
  'gradeHighSat',
  'fade',
  'vignette',
  'vignetteFeather',
  'grain',
  'grainSize'
] as const

export type NumericKey = (typeof NUMERIC_KEYS)[number]

/** le tinte sono angoli: si mediano come vettori, non come numeri */
const HUE_KEYS: NumericKey[] = ['gradeLowHue', 'gradeMidHue', 'gradeHighHue']

export interface DevelopLook {
  id: string
  label: string
  hint: string
  /** da dove vengono i valori: si cita nella UI */
  source: string
  develop: Develop
}

const look = (
  id: string,
  label: string,
  hint: string,
  source: string,
  patch: Partial<Develop>
): DevelopLook => ({
  id,
  label,
  hint,
  source,
  develop: { ...NEUTRAL_DEVELOP, ...patch }
})

/**
 * Look di partenza con i valori che girano davvero tra i fotografi: sono le
 * ricette pubblicate per Lightroom (Portra 400, orange & teal, matte fade, dark
 * & moody, bright & airy), tradotte una a una in questi parametri — comprese le
 * correzioni HSL su incarnati, cieli e verdi e il viraggio separato, che sono la
 * parte che distingue un look costruito da un filtro appiccicato sopra.
 * Si possono sommare tra loro con un peso.
 */
export const LOOKS: DevelopLook[] = [
  look('natural', 'Naturale', 'La foto come è stata scattata', 'nessuna regolazione', {}),
  look(
    'portra',
    'Portra 400',
    'Ombre aperte, luci morbide, incarnati caldi e grana fine',
    'Portra 400: contrasto −15, ombre +35, neri +20, arancio sat +8 lum +13, grana 28/32',
    {
      exposure: 24,
      contrast: -12,
      highlights: -30,
      shadows: 35,
      whites: 15,
      blacks: 20,
      temperature: 9,
      vibrance: 8,
      skinSat: 8,
      skinLum: 13,
      greenSat: -6,
      gradeLowHue: 35,
      gradeLowSat: 16,
      gradeHighHue: 45,
      gradeHighSat: 8,
      grain: 16,
      grainSize: 34
    }
  ),
  look(
    'cinema',
    'Teal & Orange',
    'Ombre cyan, luci ambra: il colore del cinema',
    'orange & teal: esp +10, contrasto +20, luci −25, ombre +25, vividezza +15, HSL arancio/acqua +25',
    {
      exposure: 10,
      contrast: 20,
      highlights: -25,
      shadows: 25,
      whites: 10,
      blacks: -10,
      temperature: 8,
      vibrance: 15,
      saturation: 6,
      skinSat: 22,
      skinLum: 6,
      skySat: 24,
      skyLum: -10,
      gradeLowHue: 195,
      gradeLowSat: 38,
      gradeMidHue: 30,
      gradeMidSat: 8,
      gradeHighHue: 35,
      gradeHighSat: 28,
      vignette: 24,
      vignetteFeather: 55
    }
  ),
  look(
    'vintage',
    'Matte vintage',
    'Bianchi trattenuti, neri alzati, pellicola scaduta',
    'matte/faded: bianchi −37, neri +9, luci −25, ombre +33, HSL verdi/blu −25, grana 30',
    {
      exposure: 6,
      contrast: -12,
      highlights: -25,
      shadows: 33,
      whites: -37,
      blacks: 9,
      temperature: 20,
      tint: 4,
      vibrance: -6,
      saturation: -14,
      skinSat: 6,
      skySat: -25,
      greenSat: -25,
      greenLum: 8,
      fade: 30,
      gradeLowHue: 32,
      gradeLowSat: 24,
      gradeHighHue: 50,
      gradeHighSat: 14,
      vignette: 30,
      vignetteFeather: 45,
      grain: 17,
      grainSize: 52
    }
  ),
  look(
    'nordic',
    'Nordico',
    'Luce fredda, colori trattenuti, cieli densi',
    'dark & moody nordico: esp −10, contrasto +20, neri −25, saturazione −12, cieli +10 lum −15',
    {
      exposure: -10,
      contrast: 20,
      highlights: -30,
      shadows: 20,
      whites: -15,
      blacks: -25,
      temperature: -14,
      tint: -4,
      vibrance: -8,
      saturation: -12,
      skinSat: 4,
      skySat: 10,
      skyLum: -16,
      greenSat: -20,
      greenLum: -8,
      gradeLowHue: 205,
      gradeLowSat: 20,
      gradeHighHue: 200,
      gradeHighSat: 8,
      vignette: 20,
      vignetteFeather: 60
    }
  ),
  look(
    'airy',
    'Aria',
    'Chiaro, arioso, ombre aperte: il look da matrimonio',
    'bright & airy: esp +18, ombre +30, neri +15, contrasto −10, incarnati aperti',
    {
      exposure: 18,
      contrast: -10,
      highlights: -15,
      shadows: 30,
      whites: 8,
      blacks: 15,
      temperature: 6,
      vibrance: 6,
      saturation: -4,
      skinSat: 5,
      skinLum: 10,
      greenSat: -12,
      greenLum: 10,
      fade: 12,
      gradeLowHue: 40,
      gradeLowSat: 10
    }
  ),
  look(
    'vivid',
    'Vivido',
    'Colori pieni e contrasto pulito, senza bruciare le luci',
    'contrasto +18, vividezza +25 (non saturazione piatta), neri −8',
    {
      exposure: 4,
      contrast: 18,
      whites: 10,
      blacks: -8,
      vibrance: 25,
      saturation: 6,
      skySat: 10,
      skyLum: -8
    }
  ),
  look(
    'bw',
    'Bianco e nero',
    'Grigio pieno, contrasto da stampa, filtro giallo sul cielo',
    'contrasto +25, bianchi +12, neri −15, filtro giallo',
    {
      bw: true,
      bwFilter: 'yellow',
      contrast: 25,
      whites: 12,
      blacks: -15,
      exposure: 2
    }
  ),
  look(
    'bwFilm',
    'B/N pellicola',
    'Bianco e nero morbido, grana grossa e leggero viraggio caldo',
    'contrasto +8, fade 18, grana 45 grossa, viraggio seppia sulle luci',
    {
      bw: true,
      bwFilter: 'orange',
      contrast: 8,
      shadows: 15,
      fade: 18,
      gradeHighHue: 40,
      gradeHighSat: 14,
      gradeLowHue: 30,
      gradeLowSat: 8,
      grain: 26,
      grainSize: 62,
      vignette: 26,
      vignetteFeather: 50
    }
  )
]

export const DEFAULT_LOOK_ID = 'natural'

/**
 * I look salvati dall'utente (gestiti da userLooks.ts) vengono registrati qui,
 * così `lookById` li risolve come quelli di fabbrica: una miscela può citarli e
 * una sessione ripresa li ritrova.
 */
let registeredUserLooks: DevelopLook[] = []

export function registerUserLooks(looks: DevelopLook[]): void {
  registeredUserLooks = looks
}

export function lookById(id: string | undefined): DevelopLook {
  return (
    LOOKS.find((l) => l.id === id) ?? registeredUserLooks.find((l) => l.id === id) ?? LOOKS[0]
  )
}

/** vero se l'id appartiene a un look salvato dall'utente */
export function isUserLook(id: string): boolean {
  return registeredUserLooks.some((look) => look.id === id)
}

/** una dose di look: id + peso 0..100 */
export interface LookDose {
  id: string
  weight: number
}

/**
 * Somma di look: «Matte vintage 60 + Nordico 40» è la media pesata dei loro
 * valori, come sovrapporre due preset dosandone l'intensità. Le tinte del
 * viraggio si mediano sul cerchio, così due tinte opposte non danno un colore
 * assurdo a metà strada.
 */
export function mixLooks(doses: LookDose[]): Develop {
  const active = doses.filter((d) => d.weight > 0 && lookById(d.id).id === d.id)
  if (active.length === 0) return { ...NEUTRAL_DEVELOP }
  const total = active.reduce((sum, d) => sum + d.weight, 0)
  if (total <= 0) return { ...NEUTRAL_DEVELOP }

  /**
   * Il divisore è 100, non la somma dei pesi: così la dose è davvero
   * un'**intensità** e non solo una proporzione. Con la media pesata pura un
   * look da solo dava sempre lo stesso risultato a qualsiasi dose (valore ×
   * peso ÷ peso = valore) e lo slider sembrava rotto. Il resto lo riempie il
   * neutro. Quando la somma supera 100 si normalizza, altrimenti due look
   * pieni raddoppierebbero i valori invece di mescolarsi.
   */
  const divisor = Math.max(100, total)

  const result = { ...NEUTRAL_DEVELOP }
  for (const key of NUMERIC_KEYS) {
    if (HUE_KEYS.includes(key)) continue
    let sum = 0
    for (const dose of active) sum += lookById(dose.id).develop[key] * dose.weight
    result[key] = Math.round(sum / divisor)
  }

  // ogni tinta si media come vettore, pesata anche dalla propria intensità
  const satOf: Record<string, NumericKey> = {
    gradeLowHue: 'gradeLowSat',
    gradeMidHue: 'gradeMidSat',
    gradeHighHue: 'gradeHighSat'
  }
  for (const key of HUE_KEYS) {
    let x = 0
    let y = 0
    for (const dose of active) {
      const develop = lookById(dose.id).develop
      const weight = dose.weight * Math.max(1, develop[satOf[key]])
      const radians = (develop[key] * Math.PI) / 180
      x += Math.cos(radians) * weight
      y += Math.sin(radians) * weight
    }
    result[key] = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360)
  }

  // il LUT non si può mediare: lo porta il look che pesa di più tra quelli che
  // ne hanno uno, con la sua dose
  const withLut = active
    .filter((dose) => lookById(dose.id).develop.lutName)
    .sort((a, b) => b.weight - a.weight)[0]
  if (withLut) {
    const source = lookById(withLut.id).develop
    result.lutName = source.lutName
    result.lutAmount = Math.round((source.lutAmount * withLut.weight) / 100)
  }

  // il bianco e nero non si può dosare a metà: si accende se i look in B/N
  // pesano almeno mezza dose piena
  const bwWeight = active
    .filter((d) => lookById(d.id).develop.bw)
    .reduce((sum, d) => sum + d.weight, 0)
  result.bw = bwWeight >= 50
  if (result.bw) {
    const strongest = active
      .filter((d) => lookById(d.id).develop.bw)
      .sort((a, b) => b.weight - a.weight)[0]
    result.bwFilter = lookById(strongest.id).develop.bwFilter
  }
  return result
}

/** nome leggibile di una miscela: «Matte vintage + Nordico» */
export function mixLabel(doses: LookDose[]): string {
  const active = doses.filter((d) => d.weight > 0)
  if (active.length === 0) return 'Nessun look'
  if (active.length === 1) return lookById(active[0].id).label
  return active
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map((d) => lookById(d.id).label)
    .join(' + ')
}

/** vecchi toni dell'album (toneId nelle sessioni salvate) → look equivalenti */
export function lookIdFromLegacyTone(toneId: string | undefined): string {
  switch (toneId) {
    case 'bw':
      return 'bw'
    case 'warm':
      return 'portra'
    case 'cold':
      return 'nordic'
    default:
      return DEFAULT_LOOK_ID
  }
}

/** quante regolazioni si discostano da una base: accende il segno «sviluppata» */
export function touchedCount(develop: Develop, base: Develop): number {
  let count = 0
  for (const key of NUMERIC_KEYS) {
    if (develop[key] !== base[key]) count += 1
  }
  if (develop.bw !== base.bw) count += 1
  if (develop.bwFilter !== base.bwFilter) count += 1
  if (develop.lutName !== base.lutName) count += 1
  if (develop.lutName && develop.lutAmount !== base.lutAmount) count += 1
  return count
}

/** hue (gradi) → rgb 0..1, saturazione e luminosità piene */
export function hueToRgb(hue: number): [number, number, number] {
  const h = (((hue % 360) + 360) % 360) / 60
  const x = 1 - Math.abs((h % 2) - 1)
  if (h < 1) return [1, x, 0]
  if (h < 2) return [x, 1, 0]
  if (h < 3) return [0, 1, x]
  if (h < 4) return [0, x, 1]
  if (h < 5) return [x, 0, 1]
  return [1, 0, x]
}

// --- strati di stampa: vignettatura e grana ---

export function vignetteStrength(d: Develop): number {
  return (d.vignette / 100) * 0.85
}

/** raggio dove la vignettatura comincia: la morbidezza sposta questo bordo */
export function vignetteInner(d: Develop): number {
  return 0.18 + (d.vignetteFeather / 100) * 0.42
}

export function grainStrength(d: Develop): number {
  return (d.grain / 100) * 0.3
}

/** lato del granulo in px: da fine (1) a grosso (4) */
export function grainPixelSize(d: Develop): number {
  return 1 + Math.round((d.grainSize / 100) * 3)
}

export const GRAIN_TILE_PX = 128

const grainCache = new Map<number, HTMLCanvasElement>()
const grainUrlCache = new Map<number, string>()

/**
 * Tile di grana. La differenza tra «grana di pellicola» e «ISO altissimo» sta
 * in due cose: l'ampiezza (il rumore digitale è violento, la grana è sottile) e
 * la morbidezza (il granulo d'argento ha bordi sfumati, il rumore ha pixel
 * secchi). Qui il rumore si genera a blocchi e poi si ammorbidisce con due
 * passate di sfocatura, e l'ampiezza è circa un terzo di prima.
 */
function buildGrainTile(pixelSize: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = GRAIN_TILE_PX
  canvas.height = GRAIN_TILE_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const raw = document.createElement('canvas')
  raw.width = GRAIN_TILE_PX
  raw.height = GRAIN_TILE_PX
  const rawCtx = raw.getContext('2d')
  if (!rawCtx) return canvas

  const cells = Math.ceil(GRAIN_TILE_PX / pixelSize)
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      // distribuzione più stretta: due estrazioni mediate, code corte
      const noise = (Math.random() + Math.random() - 1) * 0.5
      const value = Math.round(128 + noise * 118)
      rawCtx.fillStyle = `rgb(${value}, ${value}, ${value})`
      rawCtx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize)
    }
  }

  // il granulo si ammorbidisce: bordi sfumati invece di pixel quadrati
  ctx.filter = `blur(${(0.4 + pixelSize * 0.2).toFixed(2)}px)`
  ctx.drawImage(raw, 0, 0)
  ctx.filter = 'none'
  return canvas
}

export function grainCanvas(pixelSize: number): HTMLCanvasElement {
  const existing = grainCache.get(pixelSize)
  if (existing) return existing
  const canvas = buildGrainTile(pixelSize)
  grainCache.set(pixelSize, canvas)
  return canvas
}

export function grainImageUrl(pixelSize: number): string {
  const existing = grainUrlCache.get(pixelSize)
  if (existing) return existing
  const url = grainCanvas(pixelSize).toDataURL('image/png')
  grainUrlCache.set(pixelSize, url)
  return url
}

/** gradiente CSS della vignettatura */
export function vignetteGradient(d: Develop): string {
  const strength = vignetteStrength(d)
  const inner = vignetteInner(d) * 100
  const mid = inner + (100 - inner) * 0.55
  return `radial-gradient(ellipse at center, rgba(0,0,0,0) ${inner.toFixed(0)}%, rgba(0,0,0,${(strength * 0.45).toFixed(3)}) ${mid.toFixed(0)}%, rgba(0,0,0,${strength.toFixed(3)}) 100%)`
}
