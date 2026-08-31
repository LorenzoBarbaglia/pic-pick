import { useEffect, useRef, useState } from 'react'
import type { Develop } from './develop'
import { getDetailRenderer, getPreviewRenderer, PREVIEW_MAX_PX } from './developGl'
import { identityCanvas, serializeCube } from './lut'

export interface DevelopedImage {
  /** canvas con la foto sviluppata, pronto da disegnare */
  canvas: HTMLCanvasElement | null
  /** cambia a ogni nuovo rendering: serve a chi deve ridisegnare */
  version: number
}

/**
 * La foto sviluppata pronta per l'anteprima, come canvas.
 *
 * Niente codifica in JPEG/PNG: passare da un blob costava 15-25 ms per ogni
 * spostamento di slider e faceva sembrare lenta la regolazione. Qui la GPU
 * scrive su un canvas e noi ne facciamo una copia stabile — una `drawImage` da
 * canvas a canvas, un paio di millisecondi.
 *
 * Il rendering avviene solo quando cambia la foto o una regolazione: pan, zoom e
 * rotazione restano trasformazioni CSS su un'immagine già sviluppata, quindi
 * fluide. La copia è ridotta a PREVIEW_MAX_PX di lato lungo; l'export usa
 * comunque la risoluzione piena.
 */
export function useDevelopedCanvas(
  image: HTMLImageElement | null,
  develop: Develop,
  /** cambia quando arriva un LUT: obbliga a ridisegnare */
  extraKey = 0,
  /**
   * Lato lungo desiderato. Di norma bastano PREVIEW_MAX_PX, ma zoomando il CSS
   * ingrandisce questa copia e se ne vedono i pixel: chi guarda può chiedere
   * una copia più fitta (fino ai pixel veri della foto).
   */
  targetLongEdge?: number
): DevelopedImage {
  const [state, setState] = useState<DevelopedImage>({ canvas: null, version: 0 })
  const targetRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!image) {
      setState({ canvas: null, version: 0 })
      return
    }
    let cancelled = false
    // un frame di attesa raggruppa le raffiche di cambiamenti
    const timer = window.setTimeout(() => {
      if (cancelled) return
      // mai oltre i pixel veri della foto, e mai oltre un canvas ragionevole
      const cap = Math.min(4096, Math.max(640, targetLongEdge ?? PREVIEW_MAX_PX))
      const scale = Math.min(1, cap / Math.max(image.naturalWidth, image.naturalHeight))
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))

      const renderer = getPreviewRenderer()
      const source = renderer.available
        ? renderer.render(image, develop, {
            width,
            height,
            sourceWidth: image.naturalWidth,
            sourceHeight: image.naturalHeight
          })
        : null

      const target = targetRef.current ?? document.createElement('canvas')
      targetRef.current = target
      if (target.width !== width || target.height !== height) {
        target.width = width
        target.height = height
      }
      const ctx = target.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)
      // senza GPU si mostra la foto originale invece di mentire sul risultato
      ctx.drawImage(source ?? image, 0, 0, width, height)
      setState((prev) => ({ canvas: target, version: prev.version + 1 }))
    }, 16)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [image, develop, extraKey, targetLongEdge])

  // al cambio di foto la texture va ricaricata
  useEffect(() => {
    getPreviewRenderer().invalidate()
    getDetailRenderer().invalidate()
  }, [image])

  return state
}

/**
 * Una porzione sviluppata a pixel reali: la usano la lente e il controllo del
 * fuoco, che devono mostrare il dettaglio vero e non l'anteprima ridotta.
 */
export function renderDetail(
  image: HTMLImageElement,
  develop: Develop,
  region: { x: number; y: number; w: number; h: number },
  size: { width: number; height: number }
): HTMLCanvasElement | null {
  const renderer = getDetailRenderer()
  if (!renderer.available) return null
  return renderer.render(image, develop, {
    width: size.width,
    height: size.height,
    region,
    sourceWidth: image.naturalWidth,
    sourceHeight: image.naturalHeight
  })
}

/**
 * Il look corrente come LUT .cube.
 *
 * Il trucco: si dà in pasto allo shader l'immagine «identità», che contiene una
 * volta ogni colore della griglia, e si rileggono i pixel. Quello che esce è
 * esattamente la tabella di conversione del look — usabile in Resolve, Premiere,
 * Lightroom o in un'altra copia di pic&pick.
 */
export function exportLookAsCube(title: string, develop: Develop, size = 33): string | null {
  const renderer = getDetailRenderer()
  if (!renderer.available) return null
  const identity = identityCanvas(size)
  renderer.invalidate()
  const rendered = renderer.render(identity, develop, {
    width: identity.width,
    height: identity.height,
    sourceWidth: identity.width,
    sourceHeight: identity.height
  })
  if (!rendered) return null
  const pixels = renderer.readPixels(identity.width, identity.height)
  renderer.invalidate()
  if (!pixels) return null
  return serializeCube(title, size, pixels)
}

/** l'immagine intera sviluppata a piena risoluzione: per export e miniature */
export function renderFull(
  image: HTMLImageElement,
  develop: Develop,
  maxSize?: number
): HTMLCanvasElement | null {
  const renderer = getDetailRenderer()
  if (!renderer.available) return null
  const longest = Math.max(image.naturalWidth, image.naturalHeight)
  const scale = maxSize ? Math.min(1, maxSize / longest) : 1
  return renderer.render(image, develop, {
    width: image.naturalWidth * scale,
    height: image.naturalHeight * scale,
    sourceWidth: image.naturalWidth,
    sourceHeight: image.naturalHeight
  })
}
