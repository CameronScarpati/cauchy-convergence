import { describe, expect, it } from 'vitest'
import { mulberry32 } from './prng.ts'
import {
  createRunningMean,
  createRunningMedian,
  mean,
  meanPush,
  median,
  medianPush,
} from './runningStats.ts'

function bruteMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

describe('running median', () => {
  it('is NaN before any push and exact on small cases', () => {
    const state = createRunningMedian()
    expect(Number.isNaN(median(state))).toBe(true)
    medianPush(state, 2)
    expect(median(state)).toBe(2)
    medianPush(state, 7)
    expect(median(state)).toBe(4.5)
    medianPush(state, 5)
    expect(median(state)).toBe(5)
  })

  it('matches brute-force sorting after every push on random input', () => {
    const rng = mulberry32(31)
    const state = createRunningMedian()
    const seen: number[] = []
    for (let i = 0; i < 400; i++) {
      const value = (rng() - 0.5) * 200
      medianPush(state, value)
      seen.push(value)
      expect(median(state)).toBe(bruteMedian(seen))
    }
  })

  it('matches brute-force sorting on duplicates and monotone input', () => {
    for (const values of [
      [5, 5, 5, 5, 5, 5],
      [1, 2, 3, 4, 5, 6, 7, 8],
      [8, 7, 6, 5, 4, 3, 2, 1],
      [2, 2, 1, 1, 3, 3, 2, 2],
    ]) {
      const state = createRunningMedian()
      const seen: number[] = []
      for (const value of values) {
        medianPush(state, value)
        seen.push(value)
        expect(median(state)).toBe(bruteMedian(seen))
      }
    }
  })
})

describe('running mean', () => {
  it('is NaN before any push and exact on integers', () => {
    const state = createRunningMean()
    expect(Number.isNaN(mean(state))).toBe(true)
    meanPush(state, 4)
    meanPush(state, 8)
    expect(mean(state)).toBe(6)
  })

  it('tracks the brute-force mean on random input', () => {
    const rng = mulberry32(17)
    const state = createRunningMean()
    let sum = 0
    for (let i = 1; i <= 1000; i++) {
      const value = (rng() - 0.5) * 1e6
      meanPush(state, value)
      sum += value
      expect(mean(state)).toBeCloseTo(sum / i, 6)
    }
  })

  it('survives values whose raw sum would overflow', () => {
    const state = createRunningMean()
    for (let i = 0; i < 20; i++) meanPush(state, 1e307)
    expect(mean(state)).toBe(1e307)
  })
})
