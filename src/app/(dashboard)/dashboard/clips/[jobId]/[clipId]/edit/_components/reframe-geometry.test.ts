/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect } from 'vitest'
import {
  aspectValue,
  regionRatio,
  maxFitRect,
  makeRegion,
  moveRegion,
  resizeRegion,
  defaultRegions,
} from './reframe-geometry'

describe('aspectValue', () => {
  it('maps each aspect to width/height', () => {
    expect(aspectValue('1:1')).toBe(1)
    expect(aspectValue('9:16')).toBeCloseTo(0.5625)
    expect(aspectValue('16:9')).toBeCloseTo(1.7778, 3)
  })
})

describe('regionRatio', () => {
  it('single 9:16 over a 16:9 video is a tall crop (ratio < 1)', () => {
    expect(regionRatio('9:16', 'single', 16 / 9)).toBeCloseTo(0.5625 / (16 / 9), 4)
  })
  it('split doubles the region aspect (each half is wider)', () => {
    expect(regionRatio('9:16', 'split', 16 / 9)).toBeCloseTo((0.5625 * 2) / (16 / 9), 4)
  })
})

describe('maxFitRect', () => {
  it('fits a tall ratio to full height', () => {
    expect(maxFitRect(0.5)).toEqual({ w: 0.5, h: 1 })
  })
  it('fits a wide ratio to full width', () => {
    expect(maxFitRect(2)).toEqual({ w: 1, h: 0.5 })
  })
  it('falls back to full frame on a bad ratio', () => {
    expect(maxFitRect(0)).toEqual({ w: 1, h: 1 })
  })
})

describe('makeRegion', () => {
  it('centers and stays within the frame', () => {
    const r = makeRegion(0.5)
    expect(r).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 })
    expect(r.x + r.w).toBeLessThanOrEqual(1)
    expect(r.y + r.h).toBeLessThanOrEqual(1)
  })
  it('scales down about the center', () => {
    const r = makeRegion(1, 0.5, 0.5, 0.5)
    expect(r.w).toBeCloseTo(0.5)
    expect(r.h).toBeCloseTo(0.5)
    expect(r.x).toBeCloseTo(0.25)
  })
})

describe('moveRegion', () => {
  it('clamps the top-left so the box never leaves the frame', () => {
    const r = { x: 0.25, y: 0, w: 0.5, h: 1 }
    expect(moveRegion(r, 0.9, 0.9)).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 })
    expect(moveRegion(r, -0.5, -0.5)).toEqual({ x: 0, y: 0, w: 0.5, h: 1 })
  })
})

describe('resizeRegion', () => {
  it('keeps the center when resizing', () => {
    const r = makeRegion(0.5, 0.5, 0.5, 1)
    const smaller = resizeRegion(r, 0.5, 0.5)
    expect(smaller.x + smaller.w / 2).toBeCloseTo(r.x + r.w / 2)
  })
})

describe('defaultRegions', () => {
  it('single → one region, split → two', () => {
    expect(defaultRegions('9:16', 'single', 16 / 9)).toHaveLength(1)
    expect(defaultRegions('9:16', 'split', 16 / 9)).toHaveLength(2)
  })
})
