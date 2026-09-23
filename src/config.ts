import type { YMode } from './viz/scales.ts'

export type Distribution = 'cauchy' | 'normal'

export interface SimConfig {
  distribution: Distribution
  /* x0 for Cauchy, mu for Normal */
  location: number
  /* gamma for Cauchy, sigma for Normal */
  scale: number
  seed: number
  samplesPerSecond: number
  maxSamples: number
  yMode: YMode
  /* independent overlaid runs, seeded deterministically from the base seed */
  runs: number
}

export const DEFAULT_CONFIG: SimConfig = {
  distribution: 'cauchy',
  location: 0,
  scale: 1,
  seed: 42,
  samplesPerSecond: 250,
  maxSamples: 5000,
  yMode: 'symlog',
  runs: 1,
}

/* Snapshot of the primary run, throttled out of the draw loop for React. */
export interface Readout {
  n: number
  mean: number
  median: number
  lastValue: number
  offScaleCount: number
  done: boolean
}

/* One-click classroom scenarios: each cues a complete, reproducible story
   a teacher can talk over without touching the sliders. */
export interface Preset {
  label: string
  note: string
  config: SimConfig
}

export const PRESETS: Preset[] = [
  {
    label: 'One bad draw',
    note: 'Two extreme Cauchy draws near sample 580 drag the running mean down to about -12, and thousands of samples later it has still not returned to the location line.',
    config: {
      distribution: 'cauchy',
      location: 0,
      scale: 1,
      seed: 42,
      samplesPerSecond: 250,
      maxSamples: 5000,
      yMode: 'symlog',
      runs: 1,
    },
  },
  {
    label: 'Averaging buys nothing',
    note: 'Five independent Cauchy runs give five wandering means, so the jumping is not a one-off.',
    config: {
      distribution: 'cauchy',
      location: 0,
      scale: 1,
      seed: 7,
      samplesPerSecond: 500,
      maxSamples: 5000,
      yMode: 'symlog',
      runs: 5,
    },
  },
  {
    label: 'The law holds here',
    note: 'Normal draws settle inside the tightening 95 percent band, which is what the Law of Large Numbers usually looks like.',
    config: {
      distribution: 'normal',
      location: 0,
      scale: 1,
      seed: 42,
      samplesPerSecond: 250,
      maxSamples: 5000,
      yMode: 'linear',
      runs: 1,
    },
  },
]
