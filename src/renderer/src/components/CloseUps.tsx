import { useEffect, useRef } from 'react'
import type { CropRect } from '../types'
import type { Develop } from '../lib/develop'
import { renderDetail } from '../lib/useDeveloped'
import { LAYER } from '../lib/interactions'

interface CloseUpsProps {
  /** punteggio di nitidezza della foto, se già misurato (0 = non misurato) */
  sharpness?: number
  image: HTMLImageElement
  /** ritaglio corrente, in coordinate immagine */
  crop: CropRect
  /** le stesse regolazioni dell'anteprima: si giudica ciò che si salverà */
  develop: Develop
  onClose: () => void
}

/** una finestra a pixel reali su un punto del ritaglio */
function DetailTile({
  image,
  develop,
  x,
  y,
  size
}: {
  image: HTMLImageElement
  develop: Develop
  x: number
  y: number
  size: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const region = { x: x - size / 2, y: y - size / 2, w: size, h: size }
    ctx.clearRect(0, 0, size, size)
    const developed = renderDetail(image, develop, region, { width: size, height: size })
    if (developed) ctx.drawImage(developed, 0, 0)
    else ctx.drawImage(image, region.x, region.y, size, size, 0, 0, size, size)
  }, [image, develop, x, y, size])
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="rounded-[var(--pp-radius)] bg-[var(--pp-panel)] ring-1 ring-[var(--pp-line)]"
      style={{ width: size, height: size }}
    />
  )
}

const TILE_PX = 300

/** tre punti sul ritaglio: il centro e i due terzi opposti */
const POINTS = [
  { fx: 1 / 3, fy: 1 / 3, label: 'Terzo alto-sinistra' },
  { fx: 0.5, fy: 0.5, label: 'Centro' },
  { fx: 2 / 3, fy: 2 / 3, label: 'Terzo basso-destra' }
]

/**
 * Dettagli al 100%: tre finestre a pixel reali sui punti dove la nitidezza si
 * decide, senza zoomare a mano e senza perdere la composizione.
 */
export function CloseUps({ image, crop, develop, sharpness = 0, onClose }: CloseUpsProps) {
  // Esc chiude, come tutti gli altri overlay
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--pp-surface)] backdrop-blur"
      style={{ zIndex: LAYER.overlay }}
      onClick={onClose}
    >
      <div className="max-w-xl space-y-1 text-center">
        <p className="text-xs tracking-wide text-[var(--pp-ink)] uppercase">
          Controllo del fuoco · pixel reali
        </p>
        <p className="text-[11px] text-[var(--pp-ink-dim)]">
          Tre finestre ritagliate al 100% su tre punti del ritaglio: se qui il dettaglio è nitido,
          la foto è a fuoco. Serve a evitare di scoprire il mosso dopo aver salvato l&apos;album.
          Clicca o premi V per chiudere.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4">
        {POINTS.map((point) => (
          <div key={point.label} className="flex flex-col items-center gap-2">
            <DetailTile
              image={image}
              develop={develop}
              x={crop.x + crop.w * point.fx}
              y={crop.y + crop.h * point.fy}
              size={TILE_PX}
            />
            <span className="text-[11px] text-[var(--pp-ink-dim)]">{point.label}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[var(--pp-ink-dim)]">
        {image.naturalWidth} × {image.naturalHeight} px · ritaglio {Math.round(crop.w)} ×{' '}
        {Math.round(crop.h)} px
        {sharpness > 0 && (
          <>
            {' · nitidezza '}
            <span className={sharpness < 32 ? 'text-amber-400' : 'text-emerald-400'}>
              {sharpness}/100
            </span>
          </>
        )}
      </p>
    </div>
  )
}
