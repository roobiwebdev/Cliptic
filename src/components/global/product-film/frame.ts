/**
 * SOURCE OF TRUTH KEYWORDS: onFrame, whileVisible, watchVisibility,
 *   prefersReducedMotion, requestAnimationFrame, film loop, visibility gate
 *
 * WHAT:  One shared requestAnimationFrame loop for the page, plus ticking that
 *        only runs while an element is on screen in a visible tab.
 * WHY:   The film must cost nothing when scrolled away or in a background tab,
 *        and `dt` is clamped to 100 ms so returning to a tab never jumps.
 * WHERE: The film Player (player.ts).
 */

const ticks = new Set<(now: number) => void>()
let frame = 0

function run(now: number): void {
  for (const tick of ticks) tick(now)
  frame = ticks.size ? requestAnimationFrame(run) : 0
}

/** Calls `tick` every animation frame on the shared loop. Returns a stop function. */
export function onFrame(tick: (now: number) => void): () => void {
  ticks.add(tick)
  frame ||= requestAnimationFrame(run)
  return () => {
    ticks.delete(tick)
  }
}

/** Reports whether at least `threshold` of the element is on screen in a visible tab. */
export function watchVisibility(
  node: Element,
  onChange: (visible: boolean) => void,
  threshold = 0.35
): () => void {
  let intersecting = false
  const update = (): void => onChange(intersecting && !document.hidden)
  const observer = new IntersectionObserver(
    (entries) => {
      intersecting = entries.some((e) => e.isIntersecting)
      update()
    },
    { threshold }
  )
  observer.observe(node)
  document.addEventListener('visibilitychange', update)
  return () => {
    observer.disconnect()
    document.removeEventListener('visibilitychange', update)
  }
}

/** Calls `tick(dt)` every frame while `node` is visible; dt is clamped to 100 ms. */
export function whileVisible(node: Element, tick: (dt: number) => void): () => void {
  let stop: (() => void) | undefined
  const unwatch = watchVisibility(node, (visible) => {
    stop?.()
    stop = undefined
    if (!visible) return
    let last = performance.now()
    stop = onFrame((now) => {
      tick(Math.min(100, now - last))
      last = now
    })
  })
  return () => {
    unwatch()
    stop?.()
  }
}

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
