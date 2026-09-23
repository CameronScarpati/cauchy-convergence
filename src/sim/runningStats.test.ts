import fc from 'fast-check'
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

/* The midpoint rounded once, derived apart from the code under test. When
   either value is at least 1 in magnitude, halve before adding: the sum
   cannot overflow, the large value halves exactly, and any value too small
   to halve exactly sits far below its last bit. Smaller pairs add first so
   subnormal halves are not rounded twice. */
function bruteMidpoint(a: number, b: number): number {
  return Math.abs(a) >= 1 || Math.abs(b) >= 1 ? a / 2 + b / 2 : (a + b) / 2
}

function bruteMedian(values: number[]): number {
  if (values.some(Number.isNaN)) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : bruteMidpoint(sorted[mid - 1]!, sorted[mid]!)
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

  it('keeps the midpoint finite at the edge of the double range', () => {
    const max = Number.MAX_VALUE
    for (const [pair, expected] of [
      [[max, max], max],
      [[-max, -max], -max],
      [[max, -max], 0],
      [[max, max / 2], 0.75 * max],
    ] as const) {
      const state = createRunningMedian()
      for (const value of pair) medianPush(state, value)
      expect(median(state)).toBe(expected)
    }
  })

  it('becomes NaN once a NaN is pushed, wherever it arrives, and stays NaN', () => {
    for (const values of [
      [NaN, 1, 2, 3, 4],
      [1, 2, 3, 4, NaN],
      [4, NaN, 1, 3, 2],
    ]) {
      const state = createRunningMedian()
      for (const value of values) medianPush(state, value)
      expect(median(state)).toBeNaN()
      medianPush(state, 5)
      medianPush(state, 6)
      expect(median(state)).toBeNaN()
    }
  })

  it('matches brute-force sorting on arbitrary doubles, signed zeros and infinities', () => {
    const edge = fc.constantFrom(-0, 0, Infinity, -Infinity, Number.MAX_VALUE, -Number.MIN_VALUE)
    // NaN is kept rare so most sequences check the ordering for a while
    // before it arrives and turns every later median into NaN.
    const sample = fc.oneof(
      { arbitrary: fc.double(), weight: 20 },
      { arbitrary: edge, weight: 20 },
      { arbitrary: fc.constant(NaN), weight: 1 },
    )
    fc.assert(
      fc.property(fc.array(sample, { maxLength: 60, size: 'max' }), (sequence) => {
        const state = createRunningMedian()
        sequence.forEach((value, i) => {
          medianPush(state, value)
          // + 0 folds -0 into +0: the two zeros tie, so either may sit in the middle.
          expect(median(state) + 0).toBe(bruteMedian(sequence.slice(0, i + 1)) + 0)
        })
      }),
      { seed: 42 },
    )
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

  it('becomes NaN once a NaN is pushed and stays NaN', () => {
    const state = createRunningMean()
    meanPush(state, 1)
    meanPush(state, NaN)
    meanPush(state, 3)
    expect(mean(state)).toBeNaN()
  })

  it('survives values whose raw sum would overflow', () => {
    const state = createRunningMean()
    for (let i = 0; i < 20; i++) meanPush(state, 1e307)
    expect(mean(state)).toBe(1e307)
  })
})
