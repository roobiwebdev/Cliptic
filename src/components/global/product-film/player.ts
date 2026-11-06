/**
 * SOURCE OF TRUTH KEYWORDS: FilmPlayer, film clock, playWithSound, seek,
 *   replay, toggleSound, reduced motion, settled frame, useSyncExternalStore
 *
 * WHAT:  The film's clock. Loops silently by default; "Play with sound"
 *        restarts from 0 and plays once with every cue. With reduced motion it
 *        shows `settled` until the visitor presses play.
 * WHY:   Framework-agnostic (subscribe/snapshot) so React reads it with
 *        useSyncExternalStore and nothing re-renders outside the film.
 * WHERE: Created by Showcase (showcase.tsx), one per film.
 */

import type { FilmCue, FilmPlayerSnapshot } from '@/lib/types'
import { prefersReducedMotion, whileVisible } from './frame'
import { play, unlock } from './sound'

export class FilmPlayer {
  #t = 0
  #playing = true
  #sound = false
  #touched = false
  #node: Element | null = null
  #stop: (() => void) | undefined
  #listeners = new Set<() => void>()
  #snapshot: FilmPlayerSnapshot
  readonly #duration: number
  readonly #settled: number
  readonly #cues: readonly FilmCue[]

  constructor(duration: number, settled: number, cues: readonly FilmCue[]) {
    this.#duration = duration
    this.#settled = settled
    this.#cues = cues
    this.#snapshot = this.#make()
  }

  /* Reduced motion holds the still until the visitor interacts. */
  #moving(): boolean {
    return this.#touched || !prefersReducedMotion()
  }

  #make(): FilmPlayerSnapshot {
    const moving = this.#moving()
    return {
      time: moving ? this.#t : this.#settled,
      paused: !this.#playing || !moving,
      sound: this.#sound,
    }
  }

  #emit(): void {
    this.#snapshot = this.#make()
    for (const listener of this.#listeners) listener()
    this.#sync()
  }

  /* Starts or stops ticking to match the play state. */
  #sync(): void {
    const run = this.#node !== null && this.#playing && this.#moving()
    if (run && !this.#stop && this.#node) {
      this.#stop = whileVisible(this.#node, (dt) => this.#advance(dt))
    }
    if (!run && this.#stop) {
      this.#stop()
      this.#stop = undefined
    }
  }

  #advance(dt: number): void {
    const from = this.#t
    const to = from + dt
    if (this.#sound) {
      for (const c of this.#cues) if (c.t > from && c.t <= to) play(c.sound, c.variant)
    }
    if (to < this.#duration) this.#t = to
    else if (this.#sound) {
      // A sound run plays once, then rests on the last frame.
      this.#t = this.#duration
      this.#playing = false
    } else this.#t = 0
    this.#emit()
  }

  #start(t: number): void {
    this.#touched = true
    this.#t = t
    this.#playing = true
    this.#emit()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  snapshot = (): FilmPlayerSnapshot => this.#snapshot

  /** Ticks while `node` (the film frame) is on screen. Returns the cleanup. */
  observe = (node: Element): (() => void) => {
    this.#node = node
    this.#emit()
    return () => {
      this.#node = null
      this.#sync()
    }
  }

  playWithSound = (): void => {
    unlock()
    this.#sound = true
    this.#start(0)
  }

  toggle = (): void => {
    if (this.#snapshot.paused) this.#start(this.#t >= this.#duration ? 0 : this.#t)
    else {
      this.#playing = false
      this.#emit()
    }
  }

  replay = (): void => this.#start(0)

  toggleSound = (): void => {
    if (!this.#sound) unlock()
    this.#sound = !this.#sound
    this.#emit()
  }

  seek = (t: number): void => {
    this.#touched = true
    this.#t = t
    this.#emit()
  }
}
