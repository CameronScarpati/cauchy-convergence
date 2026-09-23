import { describe, expect, it } from 'vitest'
import { heapPeek, heapSize } from './heap.ts'
import { mulberry32, type Rng } from './prng.ts'
import {
  createRunningMean,
  createRunningMedian,
  mean,
  meanPush,
  median,
  medianPush,
  type RunningMean,
  type RunningMedian,
} from './runningStats.ts'
import { cauchySample, normalSample } from './sampling.ts'

/*
 * Metamorphic relations: each test transforms the input in a way whose effect
 * on the output is known exactly, so the assertions are bitwise and need no
 * statistical tolerance or independent oracle.
 */

type Sampler = (rng: Rng, location: number, scale: number) => number

interface Accumulators {
  m: RunningMean
  med: RunningMedian
}

function medianOf(values: readonly number[]): number {
  const state = createRunningMedian()
  for (const value of values) medianPush(state, value)
  return median(state)
}

/* Draws n values from a fresh seed-77 stream into new accumulators, calling
   observe after every push the way the chart loop reads its traces. */
function feed(sample: Sampler, n: number, observe?: (acc: Accumulators) => void): Accumulators {
  const rng = mulberry32(77)
  const acc = { m: createRunningMean(), med: createRunningMedian() }
  for (let i = 0; i < n; i++) {
    const value = sample(rng, 2.5, 0.75)
    meanPush(acc.m, value)
    medianPush(acc.med, value)
    observe?.(acc)
  }
  return acc
}

/* Every statistic the modules expose, including the half-sample extremes on
   top of the two median heaps and their sizes. */
function readout({ m, med }: Accumulators) {
  return {
    count: m.count,
    mean: mean(m),
    median: median(med),
    lowerMax: heapPeek(med.lower),
    lowerSize: heapSize(med.lower),
    upperMin: heapPeek(med.upper),
    upperSize: heapSize(med.upper),
  }
}

describe('metamorphic relations', () => {
  it('sampler linearity: a (mu, sigma) draw is bitwise mu + sigma * the standard draw', () => {
    const params = mulberry32(3)
    /* Cauchy computes mu + sigma * t, the same single product the relation
       forms, so any sigma is bitwise exact. Normal computes mu + (sigma * r) * c
       but the relation forms mu + sigma * (r * c); float multiplication is not
       associative, so a general sigma can differ in the last place. Scaling by a
       power of two only shifts the exponent, so there both orders round alike. */
    const cases: [Sampler, () => number][] = [
      [cauchySample, () => params() * 50],
      [normalSample, () => 2 ** Math.floor(params() * 41 - 20)],
    ]
    for (const [sample, drawSigma] of cases) {
      const scaled = mulberry32(2026)
      const standard = mulberry32(2026)
      for (let i = 0; i < 5000; i++) {
        const mu = (params() - 0.5) * 2000
        const sigma = drawSigma()
        expect(sample(scaled, mu, sigma)).toBe(mu + sigma * sample(standard, 0, 1))
      }
    }
  })

  it('median is invariant under permutation and exactly odd under negation', () => {
    const rng = mulberry32(8)
    const draws = Array.from({ length: 300 }, () => cauchySample(rng, 0, 1))
    const values = [...draws, ...draws.slice(0, 101)] // duplicates exercise tie handling
    for (const multiset of [values, values.slice(0, 400)]) {
      const expected = medianOf(multiset)
      for (let k = 0; k < 20; k++) {
        const keyed = multiset.map((value) => ({ key: rng(), value }))
        const shuffled = keyed.sort((a, b) => a.key - b.key).map(({ value }) => value)
        expect(medianOf(shuffled)).toBe(expected)
        expect(medianOf(shuffled.map((v) => -v))).toBe(-expected)
      }
    }
  })

  it('cross-N prefix consistency: N1 samples match step N1 of a longer seeded run', () => {
    for (const sample of [cauchySample, normalSample]) {
      const recorded: ReturnType<typeof readout>[] = []
      feed(sample, 3000, (acc) => recorded.push(readout(acc)))
      for (const n1 of [1, 2, 999, 1000, 2999]) {
        // The fresh run is read once at the end; the long run was read every step.
        expect(readout(feed(sample, n1))).toEqual(recorded[n1 - 1])
      }
    }
  })
})
