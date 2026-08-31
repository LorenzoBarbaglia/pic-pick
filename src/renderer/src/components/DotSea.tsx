import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { SeaParams } from '../lib/themes'
import { LAYER } from '../lib/interactions'

export interface DotSeaController {
  /** fa cadere una goccia nel punto (coordinate stage): onda che si espande e si dissipa */
  drop: (x: number, y: number) => void
  /** il mare assorbe un colore: i punti virano lentamente verso la palette dell'album */
  addTint: (color: { r: number; g: number; b: number }) => void
}

interface DotSeaProps {
  controllerRef: MutableRefObject<DotSeaController | null>
  /** parametri del preset visivo: passo, forma, ritmo dell'onda, gocce */
  sea: SeaParams
  /** quanto si vede lo sfondo: 0.7 tenue, 1 normale, 1.75 marcato */
  boost: number
}

/**
 * Sfondo generico dello stage: un mare di punti attraversato da un'onda
 * che viaggia in una direzione precisa e ogni tanto vira dolcemente verso
 * una nuova rotta. Ogni goccia (click) genera un anello che si espande,
 * gonfia e spinge i punti al suo passaggio, poi si dissipa. Passo, forma,
 * velocità e colore vengono dal preset visivo: cambiarlo cambia il mare
 * senza interrompere l'animazione né perdere i colori già assorbiti.
 */
/** livelli di opacità: i punti si raggruppano per non pagare un fill a testa */
const ALPHA_LEVELS = 5
/** oltre questo numero di punti il passo si allarga da solo */
const MAX_DOTS = 5200
const TAU = Math.PI * 2

export function DotSea({ controllerRef, sea, boost }: DotSeaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ripplesRef = useRef<{ x: number; y: number; start: number }[]>([])
  const tintSumRef = useRef({ r: 0, g: 0, b: 0, count: 0 })
  const currentTintRef = useRef({ ...sea.baseColor })
  // particelle d'ambiente: comete, scintille o granuli, secondo il mondo
  const motesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; max: number }[]>([])
  const nextCometRef = useRef(0)
  // il tick legge sempre i parametri correnti: il preset si può cambiare a caldo
  const seaRef = useRef(sea)
  seaRef.current = sea
  const boostRef = useRef(boost)
  boostRef.current = boost
  /** puntatore e sua scia, in coordinate canvas */
  const pointerRef = useRef({ x: -9999, y: -9999, inside: false, moving: 0 })
  const trailRef = useRef<{ x: number; y: number; born: number }[]>([])

  useEffect(() => {
    controllerRef.current = {
      drop: (x, y) => {
        ripplesRef.current.push({ x, y, start: performance.now() })
      },
      addTint: (color) => {
        const sum = tintSumRef.current
        sum.r += color.r
        sum.g += color.g
        sum.b += color.b
        sum.count += 1
      }
    }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1
    const resize = (): void => {
      dpr = window.devicePixelRatio || 1
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    // il canvas non riceve eventi (pointer-events: none): si ascolta la finestra
    // e si converte, senza mai passare da uno stato React
    const onPointerMove = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height
      const pointer = pointerRef.current
      pointer.moving = inside ? Math.min(1, Math.hypot(x - pointer.x, y - pointer.y) / 12) : 0
      pointer.x = x
      pointer.y = y
      pointer.inside = inside
      const trail = trailRef.current
      if (inside && (trail.length === 0 || Math.hypot(x - trail[trail.length - 1].x, y - trail[trail.length - 1].y) > 9)) {
        trail.push({ x, y, born: performance.now() })
      }
    }
    window.addEventListener('pointermove', onPointerMove)

    let currentDirection = Math.random() * Math.PI * 2
    let targetDirection = currentDirection
    let lastDirectionChange = performance.now()
    let lastFrame = performance.now()
    let phaseTime = 0

    let raf = 0
    const tick = (now: number): void => {
      const params = seaRef.current
      const dt = Math.min((now - lastFrame) / 1000, 0.05)
      lastFrame = now
      // fase accumulata: cambiare la velocità del preset non fa saltare l'onda
      phaseTime += dt * params.waveSpeed

      // ogni tot secondi il mare vira, dolcemente e di poco
      if (now - lastDirectionChange > params.directionChangeMs) {
        targetDirection =
          currentDirection + (Math.random() * params.directionSwing * 2 - params.directionSwing) * Math.PI
        lastDirectionChange = now
      }
      currentDirection += (targetDirection - currentDirection) * Math.min(1, dt * 0.12)
      const directionX = Math.cos(currentDirection)
      const directionY = Math.sin(currentDirection)

      // il colore dei punti scivola verso la media dei colori assorbiti dall'album
      const sum = tintSumRef.current
      const current = currentTintRef.current
      const base = params.baseColor
      const mix = sum.count > 0 ? Math.min(params.maxTint, sum.count * 0.05) : 0
      const targetR = base.r * (1 - mix) + (sum.count ? sum.r / sum.count : 0) * mix
      const targetG = base.g * (1 - mix) + (sum.count ? sum.g / sum.count : 0) * mix
      const targetB = base.b * (1 - mix) + (sum.count ? sum.b / sum.count : 0) * mix
      const blend = Math.min(1, dt * 0.3)
      current.r += (targetR - current.r) * blend
      current.g += (targetG - current.g) * blend
      current.b += (targetB - current.b) * blend
      const dotColor = `${current.r.toFixed(0)}, ${current.g.toFixed(0)}, ${current.b.toFixed(0)}`

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      ripplesRef.current = ripplesRef.current.filter(
        (ripple) => (now - ripple.start) / 1000 < params.rippleLifeS
      )
      const ripples = ripplesRef.current

      // densità limitata: oltre un certo numero di punti non si vede la
      // differenza, si paga solo il disegno
      const requested = params.spacing
      const area = width * height
      const spacing = Math.max(requested, Math.sqrt(area / MAX_DOTS))

      // i punti si raggruppano per livello di opacità: un path per livello,
      // cinque fill per frame invece di uno per punto
      const buckets: Path2D[] = []
      for (let i = 0; i < ALPHA_LEVELS; i++) buckets.push(new Path2D())
      const amount = boostRef.current
      const hover = params.hover
      const pointer = pointerRef.current
      // la scia invecchia e si accorcia
      const trail = trailRef.current
      const trailLife = 700
      while (trail.length > 0 && (now - trail[0].born > trailLife || trail.length > hover.trail)) {
        trail.shift()
      }
      // sorgenti del campo: il puntatore (pieno) e la sua scia (in dissolvenza)
      const field: { x: number; y: number; weight: number }[] = []
      if (pointer.inside && hover.radius > 0) {
        field.push({ x: pointer.x, y: pointer.y, weight: 1 })
        for (const point of trail) {
          field.push({ x: point.x, y: point.y, weight: 1 - (now - point.born) / trailLife })
        }
      }
      const fieldRadius = hover.radius
      const fieldRadius2 = fieldRadius * fieldRadius

      const maxRadius = params.dotBase + params.dotAmp + params.rippleAmp
      const rippleData = ripples.map((ripple) => {
        const age = (now - ripple.start) / 1000
        return {
          x: ripple.x,
          y: ripple.y,
          front: age * params.rippleSpeed,
          decay: Math.exp(-age * 0.5),
          reach: params.rippleWidth * 3
        }
      })

      for (let y = spacing / 2; y < height; y += spacing) {
        for (let x = spacing / 2; x < width; x += spacing) {
          // onda viaggiante lungo la direzione corrente + seconda armonica
          const phase = (x * directionX + y * directionY) * params.waveFrequency - phaseTime
          const wave = Math.sin(phase) + 0.35 * Math.sin(phase * 2.3 + 1.7)
          let radius = params.dotBase + params.dotAmp * (0.5 + 0.37 * wave)
          const sway = params.swayPx * Math.sin(phase + 0.8)
          let drawX = x + directionX * sway
          let drawY = y + directionY * sway

          // gocce: si calcola l'esponenziale solo dentro la banda dell'anello
          for (let i = 0; i < rippleData.length; i++) {
            const r = rippleData[i]
            const dx = x - r.x
            const dy = y - r.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            const band = distance - r.front
            if (band < -r.reach || band > r.reach) continue
            const ring =
              Math.exp(-(band * band) / (2 * params.rippleWidth * params.rippleWidth)) * r.decay
            radius += params.rippleAmp * ring
            if (distance > 0.001) {
              const push = params.ripplePush * ring
              drawX += (dx / distance) * push
              drawY += (dy / distance) * push
            }
          }

          // campo del puntatore: i punti vicini crescono e si accendono
          let touch = 0
          for (let i = 0; i < field.length; i++) {
            const source = field[i]
            const fx = x - source.x
            const fy = y - source.y
            const d2 = fx * fx + fy * fy
            if (d2 > fieldRadius2) continue
            const falloff = 1 - Math.sqrt(d2) / fieldRadius
            touch = Math.max(touch, falloff * falloff * source.weight)
          }
          if (touch > 0) radius += hover.lift * touch * amount

          const alpha = Math.min(
            params.maxAlpha,
            (0.07 + radius * 0.11) * amount + hover.glow * touch * amount
          )
          const level = Math.min(
            ALPHA_LEVELS - 1,
            Math.max(0, Math.round((alpha / params.maxAlpha) * (ALPHA_LEVELS - 1)))
          )
          const path = buckets[level]
          if (params.shape === 'circle') {
            path.moveTo(drawX + radius, drawY)
            path.arc(drawX, drawY, radius, 0, TAU)
          } else if (params.shape === 'square') {
            path.rect(drawX - radius, drawY - radius, radius * 2, radius * 2)
          } else {
            // rombo: gli spigoli danno al mare un carattere più duro
            const reach = radius * 1.35
            path.moveTo(drawX, drawY - reach)
            path.lineTo(drawX + reach, drawY)
            path.lineTo(drawX, drawY + reach)
            path.lineTo(drawX - reach, drawY)
            path.closePath()
          }
        }
      }

      for (let level = 0; level < ALPHA_LEVELS; level++) {
        const alpha = (params.maxAlpha * (level + 0.5)) / ALPHA_LEVELS
        ctx.fillStyle = `rgba(${dotColor}, ${alpha.toFixed(3)})`
        ctx.fill(buckets[level])
      }
      void maxRadius

      // alone attorno al puntatore: un solo gradiente, costo trascurabile
      if (pointer.inside && hover.halo > 0) {
        const haloRadius = hover.radius * 0.9
        const gradient = ctx.createRadialGradient(
          pointer.x,
          pointer.y,
          0,
          pointer.x,
          pointer.y,
          haloRadius
        )
        const strength = Math.min(0.5, hover.halo * 0.22 * amount)
        gradient.addColorStop(0, `rgba(${dotColor}, ${strength.toFixed(3)})`)
        gradient.addColorStop(1, `rgba(${dotColor}, 0)`)
        ctx.fillStyle = gradient
        ctx.fillRect(
          pointer.x - haloRadius,
          pointer.y - haloRadius,
          haloRadius * 2,
          haloRadius * 2
        )
      }

      // scintille sotto il puntatore: solo mentre si muove
      if (hover.sparks && pointer.inside && pointer.moving > 0.25 && motesRef.current.length < 40) {
        motesRef.current.push({
          x: pointer.x + (Math.random() - 0.5) * 16,
          y: pointer.y + (Math.random() - 0.5) * 16,
          vx: (Math.random() - 0.5) * 40,
          vy: -30 - Math.random() * 40,
          life: 0,
          max: 1 + Math.random() * 0.8
        })
      }
      pointer.moving *= 0.86

      // --- vita propria dello sfondo ---
      const motes = motesRef.current
      if (params.ambient === 'sparks') {
        // scintille che salgono dalla brace, poche per volta
        if (motes.length < 26 && Math.random() < 0.5) {
          motes.push({
            x: Math.random() * width,
            y: height + 6,
            vx: (Math.random() - 0.5) * 26,
            vy: -34 - Math.random() * 52,
            life: 0,
            max: 2.4 + Math.random() * 2
          })
        }
      } else if (params.ambient === 'drift') {
        // granuli che scendono lenti nel bagno di sviluppo
        if (motes.length < 40 && Math.random() < 0.25) {
          motes.push({
            x: Math.random() * width,
            y: -6,
            vx: (Math.random() - 0.5) * 5,
            vy: 8 + Math.random() * 14,
            life: 0,
            max: 9 + Math.random() * 6
          })
        }
      } else if (params.ambient === 'comet') {
        // una cometa attraversa il cielo di tanto in tanto
        if (now > nextCometRef.current) {
          nextCometRef.current = now + 9000 + Math.random() * 9000
          const fromLeft = Math.random() < 0.5
          motes.push({
            x: fromLeft ? -40 : width + 40,
            y: Math.random() * height * 0.55,
            vx: (fromLeft ? 1 : -1) * (150 + Math.random() * 90),
            vy: 42 + Math.random() * 34,
            life: 0,
            max: 6
          })
        }
      }

      for (let i = motes.length - 1; i >= 0; i--) {
        const mote = motes[i]
        mote.life += dt
        mote.x += mote.vx * dt
        mote.y += mote.vy * dt
        if (params.ambient === 'sparks') {
          mote.vy += 16 * dt // la scintilla rallenta e ricade
          mote.vx += Math.sin(mote.life * 5) * 6 * dt
        }
        const fade = 1 - mote.life / mote.max
        if (fade <= 0 || mote.x < -60 || mote.x > width + 60 || mote.y > height + 20) {
          motes.splice(i, 1)
          continue
        }
        if (params.ambient === 'comet') {
          // scia: un segmento che si assottiglia
          const tailX = mote.x - mote.vx * 0.22
          const tailY = mote.y - mote.vy * 0.22
          const gradient = ctx.createLinearGradient(tailX, tailY, mote.x, mote.y)
          gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
          gradient.addColorStop(1, `rgba(235, 240, 255, ${(0.75 * fade).toFixed(3)})`)
          ctx.strokeStyle = gradient
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.moveTo(tailX, tailY)
          ctx.lineTo(mote.x, mote.y)
          ctx.stroke()
        } else if (params.ambient === 'sparks') {
          ctx.fillStyle = `rgba(255, ${Math.round(170 + 60 * fade)}, 90, ${(0.85 * fade * amount).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(mote.x, mote.y, 1.5 + fade, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillStyle = `rgba(${dotColor}, ${(0.5 * fade).toFixed(3)})`
          ctx.fillRect(mote.x, mote.y, 1.6, 1.6)
        }
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ zIndex: LAYER.sea }}
    />
  )
}
