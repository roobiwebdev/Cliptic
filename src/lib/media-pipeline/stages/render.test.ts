/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect } from 'vitest'
import { buildRenderFilters, OUTPUT_DIMENSIONS } from './render'
import type { ReframeSpec } from '@/lib/types'

describe('OUTPUT_DIMENSIONS', () => {
  it('are even on both axes for every aspect (yuv420p-safe)', () => {
    for (const { width, height } of Object.values(OUTPUT_DIMENSIONS)) {
      expect(width % 2).toBe(0)
      expect(height % 2).toBe(0)
    }
    expect(OUTPUT_DIMENSIONS['9:16']).toEqual({ width: 1080, height: 1920 })
  })
})

describe('buildRenderFilters', () => {
  const dims = { width: 1080, height: 1920 }

  it('single layout: one normalized crop covering the full output frame', () => {
    const reframe: ReframeSpec = {
      aspect: '9:16',
      layout: 'single',
      regions: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.6 }],
    }
    const { filterComplex, videoLabel } = buildRenderFilters(reframe, dims)
    expect(filterComplex).toContain('crop=iw*0.500000:ih*0.600000:iw*0.100000:ih*0.200000')
    expect(filterComplex).toContain('scale=1080:1920')
    expect(videoLabel).toBe('vframe')
  })

  it('split layout: two crops stacked at even half height', () => {
    const reframe: ReframeSpec = {
      aspect: '9:16',
      layout: 'split',
      regions: [
        { x: 0, y: 0, w: 1, h: 0.5 },
        { x: 0, y: 0.5, w: 1, h: 0.5 },
      ],
    }
    const { filterComplex } = buildRenderFilters(reframe, dims)
    expect(filterComplex).toContain('vstack=inputs=2')
    expect(filterComplex).toContain('scale=1080:960') // 1920 / 2
    expect(filterComplex).toContain('[ctop]')
    expect(filterComplex).toContain('[cbot]')
  })

  it('appends the caption burn and switches the output label', () => {
    const reframe: ReframeSpec = {
      aspect: '1:1',
      layout: 'single',
      regions: [{ x: 0, y: 0, w: 1, h: 1 }],
    }
    const { filterComplex, videoLabel } = buildRenderFilters(
      reframe,
      { width: 1080, height: 1080 },
      '/tmp/x/captions.ass'
    )
    expect(filterComplex).toContain('ass=/tmp/x/captions.ass')
    expect(filterComplex).toContain('[vout]')
    expect(videoLabel).toBe('vout')
  })
})
