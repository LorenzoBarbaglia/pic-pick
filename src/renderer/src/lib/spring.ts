interface SpringOptions {
  from: number
  to: number
  velocity?: number
  stiffness?: number
  damping?: number
  onUpdate: (value: number) => void
  onComplete?: () => void
}

/**
 * Molla sotto-smorzata: overshoot e rimbalzo prima di assestarsi.
 * Restituisce una funzione di cancellazione.
 */
export function animateSpring(options: SpringOptions): () => void {
  const stiffness = options.stiffness ?? 320
  const damping = options.damping ?? 14
  let position = options.from
  let velocity = options.velocity ?? 0
  let raf = 0
  let last = performance.now()

  const tick = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    // integrazione semi-implicita a sotto-passi per stabilità numerica
    const steps = 4
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      const acceleration = -stiffness * (position - options.to) - damping * velocity
      velocity += acceleration * h
      position += velocity * h
    }
    if (Math.abs(position - options.to) < 0.01 && Math.abs(velocity) < 0.01) {
      options.onUpdate(options.to)
      options.onComplete?.()
      return
    }
    options.onUpdate(position)
    raf = requestAnimationFrame(tick)
  }

  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}
