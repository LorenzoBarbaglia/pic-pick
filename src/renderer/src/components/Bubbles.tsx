import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { SKIP_TINT } from '../lib/palette'
import { CrossMark, HeartMark } from './Icons'
import type { SortBubble } from '../types'
import { sound } from '../lib/sound'
import { usePreset } from '../lib/preset'
import { LAYER } from '../lib/interactions'
import type { BubbleParams } from '../lib/themes'

interface BubblesProps {
  /** bolle di smistamento configurate dall'utente; «Forse» e «Non passa» sono sempre aggiunte */
  bubbles: SortBubble[]
  onSort: (bubble: SortBubble) => void
  /** Shift+clic: salva una copia nella bolla senza decidere né avanzare */
  onSortExtra?: (bubble: SortBubble) => void
  /** rimanda la foto in fondo alla coda senza deciderla */
  onLater: () => void
  onSkip: () => void
  disabled?: boolean
  /** rito di chiusura: quando incrementa, tutte le bolle scoppiano in sequenza */
  popAllSignal?: number
  /** quante foto sono già finite in ogni bolla: si legge sul galleggiante */
  counts?: Record<string, number>
}

interface BubbleState {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  /** casa: il punto attorno a cui la bolla respira, in coordinate stage */
  homeX: number
  homeY: number
  /** sfasamento del respiro, perché non oscillino tutte all'unisono */
  phase: number
  /** vera dopo un lancio: vola libera finché la molla non la riporta a casa */
  free: boolean
  hovered: boolean
  dragging: boolean
  popped: boolean
  /** squash & stretch al rimbalzo, rilassa verso 1 */
  squashX: number
  squashY: number
}

interface BubbleDef {
  id: string
  label: string
  icon: ReactNode
  tint: string
}

const BUBBLE_RADIUS = 40 // metà di h-20/w-20 (80px)
const DRAG_THRESHOLD_PX = 6
const MAX_THROW_SPEED = 1500
const VELOCITY_WINDOW_MS = 120
const POP_MS = 900
/** sopra questa velocità al rilascio è un lancio; sotto, è un trasloco di casa */
const THROW_SPEED = 240
/** forza della molla che riporta a casa */
const HOME_PULL = 4.2
/** ampiezza del respiro sul posto */
const BREATH_X = 7
const BREATH_Y = 5
/** memoria delle case */
const HOMES_KEY = 'picpick-bubble-homes'

// direzioni delle goccioline dello scoppio
const POP_DROPS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2 + 0.4
  const distance = 40 + (i % 3) * 12
  return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance }
})

/** case salvate, in coordinate relative (0-1): sopravvivono al ridimensionamento */
function readHomes(): { x: number; y: number }[] {
  try {
    const raw = localStorage.getItem(HOMES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => typeof item?.x === 'number' && typeof item?.y === 'number')
      .map((item) => ({ x: item.x, y: item.y }))
  } catch {
    return []
  }
}

function writeHomes(homes: { x: number; y: number }[]): void {
  try {
    localStorage.setItem(HOMES_KEY, JSON.stringify(homes))
  } catch {
    // niente memoria: le case restano valide per questa sessione
  }
}

/**
 * Case di partenza: in fila lungo il bordo basso, centrate. Lì non coprono la
 * foto (il frame dell'album lascia libera una fascia in fondo) e si trovano
 * sempre allo stesso posto.
 */
function defaultHome(index: number, total: number): { x: number; y: number } {
  const span = Math.min(0.84, total * 0.16)
  const step = total > 1 ? span / (total - 1) : 0
  // in basso, dove anche un frame con la cornice lascia un po' di riva
  return { x: 0.5 - span / 2 + step * index, y: 0.93 }
}

/**
 * La superficie della bolla secondo il mondo: sapone iridescente, lanterna di
 * carta, brace spigolosa o goccia di sviluppo. La forma è animata da keyframes
 * diverse, sempre senza toccare `transform` (riservato allo squash della fisica).
 */
function surfaceStyle(tint: string, params: BubbleParams, index: number): CSSProperties {
  const wobble = `${params.wobbleAnimation} ${(params.wobbleSeconds + index * 0.45).toFixed(2)}s ease-in-out infinite`
  const animation = `${wobble}, bubble-regen 0.5s var(--pp-ease)`
  const glow = params.glowPx > 0 ? `0 0 ${params.glowPx}px rgba(${tint}, 0.6), ` : ''

  switch (params.style) {
    case 'lantern':
      return {
        animation,
        borderRadius: '50%',
        background: `radial-gradient(circle at 50% 44%, rgba(255, 250, 228, 0.92) 0%, rgba(255, 246, 214, 0.55) 22%, rgba(${tint}, 0.45) 58%, rgba(${tint}, 0.28) 100%)`,
        boxShadow: `${glow}inset 0 0 28px rgba(255, 238, 190, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.4)`
      }
    case 'ember':
      return {
        animation,
        // la forma è ritagliata dai keyframes: spigoli che tremolano
        background: `radial-gradient(circle at 50% 62%, rgba(255, 240, 170, 0.95) 0%, rgba(255, 170, 60, 0.85) 30%, rgba(${tint}, 0.75) 62%, rgba(60, 12, 0, 0.85) 100%)`,
        boxShadow: `${glow}inset 0 -10px 20px rgba(255, 200, 90, 0.5)`,
        filter: 'saturate(1.25)'
      }
    case 'drop':
      return {
        animation,
        borderRadius: '50% 50% 50% 50% / 58% 58% 42% 42%',
        background: `radial-gradient(circle at 42% 32%, rgba(255, 255, 255, 0.28) 0%, rgba(${tint}, 0.22) 38%, rgba(${tint}, 0.5) 100%)`,
        boxShadow: `${glow}inset 0 0 26px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.18), 0 14px 26px rgba(0, 0, 0, 0.5)`
      }
    default:
      return {
        animation,
        background: `radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.10) 26%, rgba(${tint}, 0.08) 55%, rgba(${tint}, 0.32) 80%, rgba(${tint}, 0.62) 100%)`,
        boxShadow: `inset 0 0 22px rgba(${tint}, 0.5), inset 10px -12px 24px rgba(255, 255, 255, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.35), 0 12px 32px rgba(0, 0, 0, 0.45)`
      }
  }
}

function dampAfterBounce(s: BubbleState, params: BubbleParams): void {
  const speed = Math.hypot(s.vx, s.vy)
  if (speed <= params.cruiseSpeed) return
  const factor = Math.max(speed * params.bounceDamping, params.cruiseSpeed) / speed
  s.vx *= factor
  s.vy *= factor
}

/**
 * Le bolle di smistamento.
 *
 * Ognuna ha una **casa**: sta lì e respira sul posto, di pochi pixel, senza mai
 * vagare sopra la foto (era il difetto di prima: belle da vedere, imprevedibili
 * da usare). Si possono afferrare e lanciare — rimbalzano, e una molla morbida
 * le riporta a casa — oppure trascinare piano e appoggiare altrove: in quel caso
 * è la casa che si sposta, e la scelta resta salvata.
 */
export function Bubbles({
  bubbles,
  onSort,
  onSortExtra,
  onLater,
  onSkip,
  disabled = false,
  popAllSignal = 0,
  counts = {}
}: BubblesProps) {
  const { preset } = usePreset()
  const params = preset.bubbles
  const paramsRef = useRef(params)
  paramsRef.current = params

  const defs: BubbleDef[] = [
    ...bubbles.map((b) => ({
      id: b.id,
      label: b.label,
      icon: <HeartMark size={17} />,
      tint: b.tint
    })),
    // «Forse» prende il colore d'accento del preset: resta riconoscibile in ogni mondo
    { id: '__later', label: 'Forse', icon: '?', tint: preset.vars['--pp-accent-rgb'] },
    { id: '__skip', label: 'Non passa', icon: <CrossMark size={16} />, tint: SKIP_TINT }
  ]

  const containerRef = useRef<HTMLDivElement>(null)
  const positionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const blobRefs = useRef<(HTMLSpanElement | null)[]>([])
  const statesRef = useRef<BubbleState[] | null>(null)
  const callbacksRef = useRef({ onSort, onSortExtra, onLater, onSkip, disabled, bubbles })
  callbacksRef.current = { onSort, onSortExtra, onLater, onSkip, disabled, bubbles }
  const suppressClickRef = useRef(false)
  const popTimersRef = useRef<number[]>([])
  const [pops, setPops] = useState(() => defs.map(() => ({ active: false, x: 0, y: 0, key: 0 })))
  /** casa mostrata durante il trascinamento: dice dove tornerà la bolla */
  const [homeHint, setHomeHint] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{
    index: number
    pointerId: number
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    moved: boolean
    samples: { x: number; y: number; t: number }[]
  } | null>(null)

  useEffect(
    () => () => {
      for (const timer of popTimersRef.current) clearTimeout(timer)
    },
    []
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const bubbleCount = defs.length

    if (!statesRef.current || statesRef.current.length !== bubbleCount) {
      const width = container.clientWidth
      const height = container.clientHeight
      const saved = readHomes()
      statesRef.current = Array.from({ length: bubbleCount }, (_, index) => {
        const relative = saved[index] ?? defaultHome(index, bubbleCount)
        const homeX = relative.x * width
        const homeY = relative.y * height
        return {
          x: homeX,
          y: homeY,
          vx: 0,
          vy: 0,
          radius: BUBBLE_RADIUS,
          homeX,
          homeY,
          phase: index * 1.7,
          free: false,
          hovered: false,
          dragging: false,
          popped: false,
          squashX: 1,
          squashY: 1
        }
      })
    }

    // le case sono in proporzione: se la finestra cambia, si spostano con lei
    const relativeHomes = statesRef.current.map((s) => ({
      x: s.homeX / Math.max(1, container.clientWidth),
      y: s.homeY / Math.max(1, container.clientHeight)
    }))
    const onResize = (): void => {
      const states = statesRef.current
      if (!states) return
      const width = container.clientWidth
      const height = container.clientHeight
      states.forEach((s, i) => {
        s.homeX = relativeHomes[i].x * width
        s.homeY = relativeHomes[i].y * height
      })
    }
    const observer = new ResizeObserver(onResize)
    observer.observe(container)

    let raf = 0
    let last = performance.now()

    const tick = (now: number): void => {
      const physics = paramsRef.current
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const width = container.clientWidth
      const height = container.clientHeight
      const states = statesRef.current!
      const seconds = now / 1000

      for (const s of states) {
        if (s.popped || s.dragging) continue

        if (s.free) {
          // volo libero: attrito, molla verso casa, rimbalzi sui bordi
          const friction = Math.max(0, 1 - 1.5 * dt)
          s.vx *= friction
          s.vy *= friction
          s.vx += (s.homeX - s.x) * HOME_PULL * dt
          s.vy += (s.homeY - s.y) * HOME_PULL * dt
          s.x += s.vx * dt
          s.y += s.vy * dt

          if (s.x < s.radius) {
            s.x = s.radius
            s.vx = Math.abs(s.vx)
            s.squashX = physics.squash
            s.squashY = physics.stretch
            dampAfterBounce(s, physics)
          }
          if (s.x > width - s.radius) {
            s.x = Math.max(s.radius, width - s.radius)
            s.vx = -Math.abs(s.vx)
            s.squashX = physics.squash
            s.squashY = physics.stretch
            dampAfterBounce(s, physics)
          }
          if (s.y < s.radius) {
            s.y = s.radius
            s.vy = Math.abs(s.vy)
            s.squashY = physics.squash
            s.squashX = physics.stretch
            dampAfterBounce(s, physics)
          }
          if (s.y > height - s.radius) {
            s.y = Math.max(s.radius, height - s.radius)
            s.vy = -Math.abs(s.vy)
            s.squashY = physics.squash
            s.squashX = physics.stretch
            dampAfterBounce(s, physics)
          }

          // arrivata a casa e quasi ferma: torna a respirare sul posto
          if (Math.hypot(s.x - s.homeX, s.y - s.homeY) < 10 && Math.hypot(s.vx, s.vy) < 40) {
            s.free = false
            s.vx = 0
            s.vy = 0
          }
        } else if (!s.hovered) {
          // a casa: respira, di pochi pixel, ognuna col suo tempo
          s.x = s.homeX + Math.sin(seconds * 0.62 + s.phase) * BREATH_X
          s.y = s.homeY + Math.sin(seconds * 0.47 + s.phase * 1.6) * BREATH_Y
        }

        const relax = Math.min(1, dt * 6)
        s.squashX += (1 - s.squashX) * relax
        s.squashY += (1 - s.squashY) * relax
      }

      // urti solo tra bolle in movimento: quelle a casa stanno ai loro posti
      for (let i = 0; i < states.length; i++) {
        for (let j = i + 1; j < states.length; j++) {
          const a = states[i]
          const b = states[j]
          if (a.popped || b.popped) continue
          if (!a.free && !b.free && !a.dragging && !b.dragging) continue
          const dx = b.x - a.x
          const dy = b.y - a.y
          const distance = Math.hypot(dx, dy)
          if (distance <= 0 || distance >= a.radius + b.radius) continue
          const nx = dx / distance
          const ny = dy / distance
          const overlap = a.radius + b.radius - distance
          if (a.dragging || b.dragging) {
            // la bolla trascinata sbatte via l'altra
            const other = a.dragging ? b : a
            const sign = a.dragging ? 1 : -1
            other.x += nx * overlap * sign
            other.y += ny * overlap * sign
            other.vx = nx * 320 * sign
            other.vy = ny * 320 * sign
            other.free = true
            other.squashX = physics.squash
            other.squashY = physics.stretch
          } else {
            const push = overlap / 2 + 0.5
            a.x -= nx * push
            a.y -= ny * push
            b.x += nx * push
            b.y += ny * push
            const tempVx = a.vx
            const tempVy = a.vy
            a.vx = b.vx
            a.vy = b.vy
            b.vx = tempVx
            b.vy = tempVy
            for (const s of [a, b]) {
              s.squashX = physics.squash
              s.squashY = physics.stretch
              dampAfterBounce(s, physics)
            }
          }
        }
      }

      states.forEach((s, i) => {
        if (s.popped) return
        const positionEl = positionRefs.current[i]
        const blobEl = blobRefs.current[i]
        if (positionEl) {
          positionEl.style.transform = `translate3d(${s.x - s.radius}px, ${s.y - s.radius}px, 0)`
        }
        if (blobEl) {
          blobEl.style.transform = `scale(${s.squashX.toFixed(3)}, ${s.squashY.toFixed(3)})`
        }
      })

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs.length])

  // --- scoppio e rigenerazione ---

  const popBubble = (index: number, quiet = false): void => {
    const states = statesRef.current
    if (!states || states[index].popped) return
    if (!quiet) sound.pop()
    const s = states[index]
    s.popped = true
    s.hovered = false
    s.dragging = false
    setPops((prev) =>
      prev.map((pop, i) => (i === index ? { active: true, x: s.x, y: s.y, key: pop.key + 1 } : pop))
    )
    popTimersRef.current.push(
      window.setTimeout(() => {
        // si riforma a casa propria: non c'è più motivo di ricomparire a caso
        s.x = s.homeX
        s.y = s.homeY
        s.vx = 0
        s.vy = 0
        s.free = false
        s.squashX = 1
        s.squashY = 1
        s.popped = false
        setPops((prev) => prev.map((pop, i) => (i === index ? { ...pop, active: false } : pop)))
      }, POP_MS)
    )
  }

  const activate = (index: number, extraCopy = false): void => {
    if (callbacksRef.current.disabled) return
    const def = defs[index]
    // i suoni li fa la schermata (una sola fonte, così valgono anche da tastiera)
    if (def.id === '__skip') {
      callbacksRef.current.onSkip()
    } else if (def.id === '__later') {
      callbacksRef.current.onLater()
    } else {
      const bubble = callbacksRef.current.bubbles.find((b) => b.id === def.id)
      if (!bubble) return
      // Shift = copia in più: la bolla non scoppia, la foto resta qui
      if (extraCopy) {
        callbacksRef.current.onSortExtra?.(bubble)
        return
      }
      callbacksRef.current.onSort(bubble)
    }
    popBubble(index, true)
  }

  // rito di chiusura: le bolle scoppiano una dopo l'altra
  const lastPopAllRef = useRef(popAllSignal)
  useEffect(() => {
    if (popAllSignal === lastPopAllRef.current) return
    lastPopAllRef.current = popAllSignal
    defs.forEach((_, i) => {
      // il suono del rito lo fa la schermata (arpeggio): qui solo il visivo
      popTimersRef.current.push(window.setTimeout(() => popBubble(i, true), i * 200))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popAllSignal])

  // --- trascinamento: lancio, oppure trasloco della casa ---

  const pointerInContainer = (e: ReactPointerEvent): { x: number; y: number } | null => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onBubblePointerDown = (index: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    const states = statesRef.current
    const point = pointerInContainer(e)
    if (!states || !point) return
    const s = states[index]
    dragRef.current = {
      index,
      pointerId: e.pointerId,
      startX: point.x,
      startY: point.y,
      offsetX: point.x - s.x,
      offsetY: point.y - s.y,
      moved: false,
      samples: [{ x: point.x, y: point.y, t: performance.now() }]
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onBubblePointerMove = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    const states = statesRef.current
    const container = containerRef.current
    const point = pointerInContainer(e)
    if (!drag || drag.pointerId !== e.pointerId || !states || !container || !point) return

    if (!drag.moved) {
      if (Math.hypot(point.x - drag.startX, point.y - drag.startY) < DRAG_THRESHOLD_PX) return
      drag.moved = true
      states[drag.index].dragging = true
      // durante il trascinamento si vede la casa: lì tornerà, se la lanci
      setHomeHint({ x: states[drag.index].homeX, y: states[drag.index].homeY })
    }

    const s = states[drag.index]
    s.x = Math.min(Math.max(point.x - drag.offsetX, s.radius), container.clientWidth - s.radius)
    s.y = Math.min(Math.max(point.y - drag.offsetY, s.radius), container.clientHeight - s.radius)

    const now = performance.now()
    drag.samples.push({ x: point.x, y: point.y, t: now })
    while (drag.samples.length > 2 && now - drag.samples[0].t > VELOCITY_WINDOW_MS) {
      drag.samples.shift()
    }
  }

  const releaseDrag = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    const states = statesRef.current
    const container = containerRef.current
    if (!drag || drag.pointerId !== e.pointerId || !states || !container) return
    dragRef.current = null
    setHomeHint(null)
    if (!drag.moved) return

    const s = states[drag.index]
    s.dragging = false
    suppressClickRef.current = true

    // velocità di lancio stimata sul movimento recente del puntatore
    const first = drag.samples[0]
    const lastSample = drag.samples[drag.samples.length - 1]
    const dtSeconds = (lastSample.t - first.t) / 1000
    let vx = dtSeconds > 0.01 ? (lastSample.x - first.x) / dtSeconds : 0
    let vy = dtSeconds > 0.01 ? (lastSample.y - first.y) / dtSeconds : 0
    const speed = Math.hypot(vx, vy)

    if (speed > THROW_SPEED) {
      // lancio: vola, rimbalza, e poi la molla la riporta a casa
      if (speed > MAX_THROW_SPEED) {
        vx *= MAX_THROW_SPEED / speed
        vy *= MAX_THROW_SPEED / speed
      }
      s.vx = vx
      s.vy = vy
      s.free = true
      return
    }

    // appoggio lento: qui è la casa che si sposta, e la scelta si ricorda
    s.homeX = s.x
    s.homeY = s.y
    s.vx = 0
    s.vy = 0
    s.free = false
    sound.snap()
    writeHomes(
      states.map((state) => ({
        x: state.homeX / Math.max(1, container.clientWidth),
        y: state.homeY / Math.max(1, container.clientHeight)
      }))
    )
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: LAYER.bubbles }}
    >
      {/* la casa, mostrata solo mentre si trascina */}
      {homeHint && (
        <span
          className="pointer-events-none absolute rounded-full border-2 border-dashed border-white/40"
          style={{
            left: homeHint.x - BUBBLE_RADIUS,
            top: homeHint.y - BUBBLE_RADIUS,
            width: BUBBLE_RADIUS * 2,
            height: BUBBLE_RADIUS * 2
          }}
        />
      )}

      {defs.map((bubble, i) => {
        const pop = pops[i]
        const state = statesRef.current?.[i]

        if (pop?.active) {
          // il disfacimento della bolla cambia col mondo: goccioline, anelli,
          // scintille o una macchia d'inchiostro
          return (
            <div
              key={`${bubble.id}-pop-${pop.key}`}
              className="pointer-events-none absolute top-0 left-0"
              style={{
                transform: `translate3d(${pop.x - BUBBLE_RADIUS}px, ${pop.y - BUBBLE_RADIUS}px, 0)`,
                width: BUBBLE_RADIUS * 2,
                height: BUBBLE_RADIUS * 2
              }}
            >
              {params.pop === 'ripple' &&
                [0, 0.12, 0.24].map((delay, k) => (
                  <div
                    key={k}
                    className="absolute inset-0 rounded-full border"
                    style={{
                      borderColor: `rgba(${bubble.tint}, ${(0.75 - k * 0.2).toFixed(2)})`,
                      animation: `pop-ripple 1.1s ease-out ${delay}s forwards`
                    }}
                  />
                ))}

              {params.pop === 'sparks' && (
                <>
                  <div
                    className="absolute inset-3 rounded-full"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(255,240,170,0.95), rgba(255,140,30,0.4) 55%, rgba(0,0,0,0) 75%)',
                      animation: 'bubble-pop-ring 0.32s ease-out forwards'
                    }}
                  />
                  {POP_DROPS.map((drop, k) => (
                    <span
                      key={k}
                      className="absolute h-1.5 w-1.5 rounded-full"
                      style={
                        {
                          left: BUBBLE_RADIUS - 3,
                          top: BUBBLE_RADIUS - 3,
                          backgroundColor: k % 2 ? 'rgb(255, 226, 150)' : `rgb(${bubble.tint})`,
                          boxShadow: '0 0 8px rgba(255, 190, 90, 0.9)',
                          animation: `pop-spark ${(0.7 + (k % 3) * 0.12).toFixed(2)}s ease-out forwards`,
                          '--dx': `${drop.dx.toFixed(1)}px`,
                          '--dy': `${drop.dy.toFixed(1)}px`
                        } as CSSProperties
                      }
                    />
                  ))}
                </>
              )}

              {params.pop === 'ink' && (
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `radial-gradient(circle at 50% 50%, rgba(${bubble.tint},0.85) 0%, rgba(${bubble.tint},0.35) 55%, rgba(0,0,0,0) 78%)`,
                    animation: 'pop-ink 0.95s ease-out forwards'
                  }}
                />
              )}

              {params.pop === 'droplets' && (
                <>
                  <div
                    className="absolute inset-0 rounded-full border-2"
                    style={{
                      borderColor: `rgba(${bubble.tint}, 0.8)`,
                      animation: 'bubble-pop-ring 0.5s ease-out forwards'
                    }}
                  />
                  {POP_DROPS.map((drop, k) => (
                    <span
                      key={k}
                      className="absolute h-2 w-2 rounded-full"
                      style={
                        {
                          left: BUBBLE_RADIUS - 4,
                          top: BUBBLE_RADIUS - 4,
                          backgroundColor: `rgba(${bubble.tint}, 0.75)`,
                          animation: 'bubble-pop-drop 0.55s ease-out forwards',
                          '--dx': `${drop.dx.toFixed(1)}px`,
                          '--dy': `${drop.dy.toFixed(1)}px`
                        } as CSSProperties
                      }
                    />
                  ))}
                </>
              )}
            </div>
          )
        }

        return (
          <button
            key={bubble.id}
            ref={(el) => {
              positionRefs.current[i] = el
            }}
            onPointerEnter={() => {
              if (statesRef.current) statesRef.current[i].hovered = true
            }}
            onPointerLeave={() => {
              if (statesRef.current) statesRef.current[i].hovered = false
            }}
            onPointerDown={onBubblePointerDown(i)}
            onPointerMove={onBubblePointerMove}
            onPointerUp={releaseDrag}
            onPointerCancel={releaseDrag}
            onClick={(e) => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false
                return
              }
              activate(i, e.shiftKey)
            }}
            title={`${bubble.label} — trascina piano per spostarla, lanciala per giocare`}
            className="pointer-events-auto absolute top-0 left-0 cursor-grab touch-none active:cursor-grabbing"
            style={{
              willChange: 'transform',
              transform: state
                ? `translate3d(${state.x - BUBBLE_RADIUS}px, ${state.y - BUBBLE_RADIUS}px, 0)`
                : 'translate3d(-200px, -200px, 0)'
            }}
          >
            <span className="block transition-transform duration-150 hover:scale-110">
              <span
                key={`blob-${pop?.key ?? 0}`}
                ref={(el) => {
                  blobRefs.current[i] = el
                }}
                className="relative flex h-20 w-20 flex-col items-center justify-center overflow-hidden text-white"
                style={surfaceStyle(bubble.tint, params, i)}
              >
                {/* strato luminoso: iridescenza del sapone, fiamma della lanterna,
                    cuore della brace o riflesso della goccia */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute rounded-[inherit] mix-blend-screen ${
                    params.style === 'soap' ? '-inset-3' : 'inset-0'
                  }`}
                  style={{
                    background: params.sheenGradient,
                    opacity: params.sheenOpacity,
                    animation:
                      params.style === 'soap'
                        ? `bubble-sheen ${params.sheenSeconds}s ease-in-out infinite`
                        : `bubble-glow ${params.sheenSeconds}s ease-in-out infinite`,
                    filter: params.style === 'soap' ? 'blur(7px)' : 'blur(4px)'
                  }}
                />
                {/* riflesso speculare: solo dove c'è una superficie che riflette */}
                {(params.style === 'soap' || params.style === 'drop') && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-3 left-3.5 h-4 w-7 -rotate-25 rounded-full bg-white/70 blur-[5px]"
                  />
                )}
                <span className="relative z-10 flex items-center justify-center text-lg leading-none [filter:drop-shadow(0_1px_4px_rgba(0,0,0,0.55))] [text-shadow:0_1px_5px_rgba(0,0,0,0.55)]">
                  {bubble.icon}
                </span>
                <span className="relative z-10 max-w-[72px] truncate px-1 text-[11px] font-semibold [text-shadow:0_1px_5px_rgba(0,0,0,0.55)]">
                  {bubble.label}
                </span>
                {(counts[bubble.id] ?? 0) > 0 && (
                  <span className="relative z-10 text-[10px] tabular-nums opacity-80 [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
                    {counts[bubble.id]}
                  </span>
                )}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
