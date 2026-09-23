import { scaleLinear, scaleLog, scaleSymlog } from 'd3-scale'

export type YMode = 'symlog' | 'linear'
export type XMode = 'linear' | 'log'

/*
 * Minimal structural view of a d3 continuous scale so draw code depends on
 * math only, never on d3's DOM-facing helpers.
 */
export interface NumericScale {
  (value: number): number
  domain(): number[]
  ticks(count?: number): number[]
}

/* Both y modes clamp to their domain; anything outside is pinned to the
   edge by the scale and reported through isOffScale for annotation. The
   limit stays modest so the region near the target line keeps resolution;
   rarer, larger spikes clip and get the arrow annotation instead. */
export const SYMLOG_LIMIT = 1e3

/* Log mode gives the early samples, where all the visible convergence
   happens, most of the width. Sample counts start at 1, so the log
   domain is always valid. */
export function makeXScale(
  maxSamples: number,
  range: [number, number],
  mode: XMode = 'linear',
): NumericScale {
  const domain: [number, number] = [1, Math.max(2, maxSamples)]
  if (mode === 'log') {
    return scaleLog().domain(domain).range(range)
  }
  return scaleLinear().domain(domain).range(range)
}

export function makeYScale(
  mode: YMode,
  center: number,
  gamma: number,
  range: [number, number],
  /* Half-span of the linear mode in units of the scale parameter. Cauchy
     means wander, so they get room; a Normal mean stays within a few
     sigma, so a tight span keeps its convergence visible. */
  spanFactor = 10,
): NumericScale {
  if (mode === 'symlog') {
    /* The symlog constant is tuned near the scale parameter so typical
       draws render linearly and only tail spikes compress. */
    return scaleSymlog()
      .domain([-SYMLOG_LIMIT, SYMLOG_LIMIT])
      .constant(Math.max(gamma, 0.01))
      .range(range)
      .clamp(true)
  }
  const span = spanFactor * gamma
  return scaleLinear()
    .domain([center - span, center + span])
    .range(range)
    .clamp(true)
}

export function isOffScale(scale: NumericScale, value: number): boolean {
  const [d0, d1] = scale.domain()
  if (d0 === undefined || d1 === undefined) {
    throw new Error('Scale domain needs two endpoints to test a value against')
  }
  return value < Math.min(d0, d1) || value > Math.max(d0, d1)
}

/* Symlog's own ticks are unreadable; signed decades are the honest labels
   for a log-compressed axis. Linear mode defers to d3's nice ticks. */
export function yTickValues(mode: YMode, scale: NumericScale): number[] {
  if (mode === 'linear') return scale.ticks(7)
  const decades = [1, 10, 100, 1e3, 1e4, 1e6].filter((d) => d <= SYMLOG_LIMIT)
  return [...decades.map((d) => -d).reverse(), 0, ...decades]
}

export function formatTick(value: number): string {
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e4) {
    return `${value < 0 ? '-' : ''}1e${Math.round(Math.log10(abs))}`
  }
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toPrecision(3)))
}

export function formatReadout(value: number): string {
  if (Number.isNaN(value)) return 'n/a'
  const abs = Math.abs(value)
  if (abs >= 1e4 || (abs > 0 && abs < 1e-2)) return value.toExponential(2)
  return value.toFixed(3)
}
