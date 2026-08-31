/**
 * Il suono dell'app è uno strumento, non una raccolta di effetti: ogni mondo
 * visivo ha una voce (scala musicale, timbro, riverbero, percussioni) e ogni
 * gesto suona una nota di quella scala. Smistare un album diventa una piccola
 * frase musicale che resta coerente con sé stessa.
 *
 * Tutto è sintetizzato con la Web Audio API: nessun asset, volumi bassi.
 */

export interface SoundVoice {
  waveform: OscillatorType
  /** semitoni sopra la tonica: la scala su cui suonano le bolle */
  scale: number[]
  /** tonica in Hz */
  rootHz: number
  /** coda di riverbero in secondi (0 = secco) */
  reverbSeconds: number
  /** taglio del passa-basso: quanto è brillante la voce */
  brightness: number
  /** carattere delle percussioni */
  percussion: 'splash' | 'click' | 'thud' | 'dust'
  /** volume generale della voce */
  gain: number
}

export const DEFAULT_VOICE: SoundVoice = {
  waveform: 'sine',
  scale: [0, 4, 7, 11, 14],
  rootHz: 262,
  reverbSeconds: 1.6,
  brightness: 5200,
  percussion: 'splash',
  gain: 1
}

let muted = false
try {
  muted = localStorage.getItem('picpick-muted') === '1'
} catch {
  // localStorage non disponibile: pazienza
}

let voice: SoundVoice = DEFAULT_VOICE

let ctx: AudioContext | null = null
let master: GainNode | null = null
let tone: BiquadFilterNode | null = null
let dry: GainNode | null = null
let wet: GainNode | null = null
let reverb: ConvolverNode | null = null
let reverbSeconds = -1

/** impulso di riverbero sintetico: rumore che decade, niente file da caricare */
function buildImpulse(context: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds))
  const buffer = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, 2.6)
      data[i] = (Math.random() * 2 - 1) * decay
    }
  }
  return buffer
}

function ensureGraph(): AudioContext | null {
  if (muted) return null
  try {
    if (!ctx) {
      ctx = new AudioContext()
      master = ctx.createGain()
      tone = ctx.createBiquadFilter()
      tone.type = 'lowpass'
      dry = ctx.createGain()
      wet = ctx.createGain()
      reverb = ctx.createConvolver()
      // sorgenti → tono → (asciutto + riverbero) → master → uscita
      tone.connect(dry).connect(master)
      tone.connect(reverb).connect(wet).connect(master)
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    applyVoice()
    return ctx
  } catch {
    return null
  }
}

function applyVoice(): void {
  if (!ctx || !master || !tone || !dry || !wet || !reverb) return
  master.gain.value = 0.9 * voice.gain
  tone.frequency.value = voice.brightness
  const wetAmount = voice.reverbSeconds > 0 ? Math.min(0.55, voice.reverbSeconds / 5) : 0
  wet.gain.value = wetAmount
  dry.gain.value = 1 - wetAmount * 0.45
  if (voice.reverbSeconds !== reverbSeconds) {
    reverbSeconds = voice.reverbSeconds
    reverb.buffer = buildImpulse(ctx, Math.max(0.05, voice.reverbSeconds))
  }
}

/** frequenza di un grado della scala della voce (l'ottava sale da sola) */
function noteHz(step: number): number {
  const scale = voice.scale.length > 0 ? voice.scale : DEFAULT_VOICE.scale
  const octave = Math.floor(step / scale.length)
  const semitone = scale[((step % scale.length) + scale.length) % scale.length] + octave * 12
  return voice.rootHz * Math.pow(2, semitone / 12)
}

interface NoteOptions {
  duration?: number
  volume?: number
  delay?: number
  /** glissando verso questa frequenza */
  to?: number
  waveform?: OscillatorType
}

function note(hz: number, options: NoteOptions = {}): void {
  const context = ensureGraph()
  if (!context || !tone) return
  const { duration = 0.32, volume = 0.09, delay = 0, to, waveform } = options
  const t0 = context.currentTime + delay
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = waveform ?? voice.waveform
  osc.frequency.setValueAtTime(hz, t0)
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + duration)
  // attacco morbido e coda esponenziale: mai un click
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(volume, t0 + Math.min(0.03, duration / 4))
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain).connect(tone)
  osc.start(t0)
  osc.stop(t0 + duration + 0.03)
}

function noiseBurst(duration: number, filterHz: number, volume: number, delay = 0): void {
  const context = ensureGraph()
  if (!context || !tone) return
  const t0 = context.currentTime + delay
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1
  const source = context.createBufferSource()
  source.buffer = buffer
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = filterHz
  filter.Q.value = 0.8
  const gain = context.createGain()
  gain.gain.setValueAtTime(volume, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  source.connect(filter).connect(gain).connect(tone)
  source.start(t0)
}

/** la percussione del mondo corrente: acqua, legno, terra o polvere */
function percuss(volume = 0.1, delay = 0): void {
  switch (voice.percussion) {
    case 'click':
      noiseBurst(0.035, 3200, volume, delay)
      note(voice.rootHz * 4, { duration: 0.05, volume: volume * 0.5, delay, waveform: 'square' })
      break
    case 'thud':
      noiseBurst(0.06, 480, volume, delay)
      note(voice.rootHz / 2, { duration: 0.22, volume: volume * 0.9, delay, to: voice.rootHz / 3, waveform: 'triangle' })
      break
    case 'dust':
      noiseBurst(0.14, 1100, volume * 0.7, delay)
      break
    default:
      noiseBurst(0.07, 1600, volume, delay)
      note(noteHz(4), { duration: 0.18, volume: volume * 0.7, delay, to: noteHz(0) })
  }
}

export const sound = {
  isMuted: (): boolean => muted,
  setMuted: (value: boolean): void => {
    muted = value
    try {
      localStorage.setItem('picpick-muted', value ? '1' : '0')
    } catch {
      // ignora
    }
  },
  /** il mondo visivo detta scala, timbro, riverbero e percussioni */
  setVoice: (value: SoundVoice): void => {
    voice = value
    if (ctx) applyVoice()
  },

  /** una bolla di smistamento: ogni bolla ha la sua nota nella scala */
  bubble: (index: number): void => {
    percuss(0.07)
    note(noteHz(index), { duration: 0.5, volume: 0.1 })
    note(noteHz(index + 2), { duration: 0.42, volume: 0.045, delay: 0.055 })
  },
  /** «Forse»: due note che non si decidono */
  later: (): void => {
    note(noteHz(1), { duration: 0.2, volume: 0.075 })
    note(noteHz(0), { duration: 0.26, volume: 0.06, delay: 0.13 })
  },
  /** «Non passa»: un passo in basso, asciutto */
  skip: (): void => {
    note(noteHz(0) / 2, { duration: 0.22, volume: 0.075, to: noteHz(0) / 2.6, waveform: 'triangle' })
    percuss(0.05, 0.02)
  },
  /** annulla: la nota risale */
  undo: (): void => {
    note(noteHz(0), { duration: 0.28, volume: 0.075, to: noteHz(3) })
  },
  /** nuovo capitolo: un accordo che apre */
  chapter: (): void => {
    note(noteHz(0), { duration: 1.1, volume: 0.07 })
    note(noteHz(2), { duration: 1.1, volume: 0.055, delay: 0.09 })
    note(noteHz(4), { duration: 1.2, volume: 0.045, delay: 0.18 })
  },
  /** album chiuso: l'arpeggio del rito */
  finish: (): void => {
    for (let i = 0; i < 6; i++) {
      note(noteHz(i), { duration: 0.9, volume: 0.07 - i * 0.006, delay: i * 0.14 })
    }
  },
  /** scoppio di bolla (usato anche dal rito di chiusura) */
  pop: (): void => {
    percuss(0.09)
  },
  /** la foto scatta di 90°: un colpo meccanico secco */
  rotate: (): void => {
    percuss(0.06)
    note(noteHz(2), { duration: 0.12, volume: 0.06, to: noteHz(0), waveform: 'triangle' })
  },
  /** ritaglio centrato nel frame: una nota piena, la ricompensa */
  center: (): void => {
    note(noteHz(4), { duration: 0.4, volume: 0.07 })
    note(noteHz(7), { duration: 0.35, volume: 0.04, delay: 0.04 })
  },
  /** aggancio magnetico: un clic brevissimo, quasi impercettibile */
  snap: (): void => {
    note(noteHz(4) * 2, { duration: 0.05, volume: 0.045, waveform: 'sine' })
  },
  /** goccia sul mare */
  drop: (): void => {
    percuss(0.08)
    note(noteHz(3), { duration: 0.3, volume: 0.05, to: noteHz(0) })
  },
  /** colpo sulla roccia */
  crack: (): void => {
    noiseBurst(0.05, 2600, 0.12)
    note(voice.rootHz / 2, { duration: 0.09, volume: 0.07, to: voice.rootHz / 4, waveform: 'triangle' })
  },
  /** frantumazione della roccia */
  shatter: (): void => {
    noiseBurst(0.06, 2400, 0.12)
    noiseBurst(0.07, 1800, 0.1, 0.06)
    noiseBurst(0.09, 1200, 0.08, 0.13)
    note(voice.rootHz / 3, { duration: 0.45, volume: 0.08, to: voice.rootHz / 6, waveform: 'triangle' })
  }
}
