import { line } from 'd3-shape'
import { formatTick, type NumericScale } from './scales.ts'

export interface Margin {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ChartLayout {
  width: number
  height: number
  margin: Margin
}

export interface PlotArea {
  x: number
  y: number
  w: number
  h: number
}

export const DEFAULT_MARGIN: Margin = { top: 18, right: 20, bottom: 30, left: 58 }

export function plotArea(layout: ChartLayout): PlotArea {
  const { width, height, margin } = layout
  return {
    x: margin.left,
    y: margin.top,
    w: Math.max(0, width - margin.left - margin.right),
    h: Math.max(0, height - margin.top - margin.bottom),
  }
}

export interface AxisColors {
  grid: string
  label: string
}

export interface TraceStyle {
  color: string
  width: number
  alpha?: number
  dash?: number[]
}

export function clearCanvas(ctx: CanvasRenderingContext2D, layout: ChartLayout): void {
  ctx.clearRect(0, 0, layout.width, layout.height)
}

/* Half-pixel offset keeps 1px hairlines crisp after the dpr transform. */
function crisp(v: number): number {
  return Math.round(v) + 0.5
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  yScale: NumericScale,
  tickValues: number[],
  color: string,
): void {
  const area = plotArea(layout)
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const t of tickValues) {
    const y = crisp(yScale(t))
    ctx.moveTo(area.x, y)
    ctx.lineTo(area.x + area.w, y)
  }
  ctx.stroke()
  ctx.restore()
}

export function drawAxes(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  xScale: NumericScale,
  yScale: NumericScale,
  yTicks: number[],
  colors: AxisColors,
  font: string,
  xTicks?: number[],
): void {
  const area = plotArea(layout)
  ctx.save()
  ctx.font = font
  ctx.fillStyle = colors.label
  ctx.strokeStyle = colors.grid
  ctx.lineWidth = 1

  const baseline = crisp(area.y + area.h)
  ctx.beginPath()
  ctx.moveTo(area.x, baseline)
  ctx.lineTo(area.x + area.w, baseline)
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const t of xTicks ?? xScale.ticks(6)) {
    if (!Number.isInteger(t)) continue
    const x = xScale(t)
    ctx.beginPath()
    ctx.moveTo(crisp(x), baseline)
    ctx.lineTo(crisp(x), baseline + 4)
    ctx.stroke()
    ctx.fillText(formatTick(t), x, baseline + 7)
  }

  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (const t of yTicks) {
    ctx.fillText(formatTick(t), area.x - 8, yScale(t))
  }
  ctx.restore()
}

/* Dotted rather than dashed so the converged median, which is dashed in
   the distribution hue, stays distinguishable when it sits on the line. */
export function drawTargetLine(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  yScale: NumericScale,
  value: number,
  color: string,
): void {
  const area = plotArea(layout)
  const y = crisp(yScale(value))
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.setLineDash([2, 4])
  ctx.beginPath()
  ctx.moveTo(area.x, y)
  ctx.lineTo(area.x + area.w, y)
  ctx.stroke()
  ctx.restore()
}

/*
 * The 95% central band for the running mean of Normal draws, bounded by
 * location plus and minus 1.96 sigma over the square root of n. Sampled
 * geometrically so the funnel mouth stays smooth. The Cauchy gets no band
 * on purpose: with no variance there is nothing of the kind to draw.
 */
export function drawNormalBand(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  xScale: NumericScale,
  yScale: NumericScale,
  location: number,
  sigma: number,
  maxN: number,
  color: string,
): void {
  const area = plotArea(layout)
  const half = (n: number) => (1.96 * sigma) / Math.sqrt(n)
  const ns: number[] = []
  for (let n = 1; n < maxN; n += Math.max(1, Math.floor(n / 50))) ns.push(n)
  ns.push(maxN)

  ctx.save()
  ctx.beginPath()
  ctx.rect(area.x, area.y, area.w, area.h)
  ctx.clip()

  ctx.beginPath()
  ns.forEach((n, i) => {
    const x = xScale(n)
    const y = yScale(location + half(n))
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  for (let i = ns.length - 1; i >= 0; i--) {
    const n = ns[i]
    if (n === undefined) continue
    ctx.lineTo(xScale(n), yScale(location - half(n)))
  }
  ctx.closePath()
  ctx.globalAlpha = 0.08
  ctx.fillStyle = color
  ctx.fill()

  ctx.globalAlpha = 0.45
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.setLineDash([2, 3])
  for (const sign of [1, -1]) {
    ctx.beginPath()
    ns.forEach((n, i) => {
      const x = xScale(n)
      const y = yScale(location + sign * half(n))
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
  ctx.restore()
}

/*
 * Trace values are indexed by sample count: values[i] is the statistic
 * after sample i + 1. A subarray view keeps the per-frame path allocation
 * free; d3-shape only emits path commands into the canvas context.
 */
export function drawTrace(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  xScale: NumericScale,
  yScale: NumericScale,
  values: Float64Array,
  count: number,
  style: TraceStyle,
): void {
  if (count < 2) return
  const area = plotArea(layout)
  ctx.save()
  ctx.beginPath()
  ctx.rect(area.x, area.y, area.w, area.h)
  ctx.clip()
  ctx.strokeStyle = style.color
  ctx.lineWidth = style.width
  ctx.globalAlpha = style.alpha ?? 1
  ctx.setLineDash(style.dash ?? [])
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (count > area.w * 2) {
    decimatedPath(ctx, xScale, yScale, values, count)
  } else {
    const path = line<number>()
      .x((_, i) => xScale(i + 1))
      .y((v) => yScale(v))
      .defined((v) => Number.isFinite(v))
      .context(ctx)
    path(values.subarray(0, count))
  }
  ctx.stroke()
  ctx.restore()
}

/*
 * Min-max envelope per pixel column once points outnumber pixels: caps the
 * path at two points per column while preserving every spike, which stride
 * sampling would silently drop.
 */
function decimatedPath(
  ctx: CanvasRenderingContext2D,
  xScale: NumericScale,
  yScale: NumericScale,
  values: Float64Array,
  count: number,
): void {
  const first = values[0]
  if (first === undefined) return
  let col = Math.round(xScale(1))
  let min = first
  let max = first
  let started = false
  const emit = (x: number, lo: number, hi: number) => {
    const yLo = yScale(lo)
    if (started) ctx.lineTo(x, yLo)
    else {
      ctx.moveTo(x, yLo)
      started = true
    }
    const yHi = yScale(hi)
    if (yHi !== yLo) ctx.lineTo(x, yHi)
  }
  for (let i = 1; i < count; i++) {
    const v = values[i]
    if (v === undefined || !Number.isFinite(v)) continue
    const x = Math.round(xScale(i + 1))
    if (x === col) {
      if (v < min) min = v
      if (v > max) max = v
      continue
    }
    emit(col, min, max)
    col = x
    min = v
    max = v
  }
  emit(col, min, max)
}

export interface OffScaleEvent {
  n: number
  value: number
}

export interface MarkerStyle {
  color: string
  /* Casing stroke behind the label so it stays legible over traces. */
  casing: string
  font: string
  formatValue: (v: number) => string
}

/*
 * The runaway spike annotation: a small arrow pinned at the clip edge with
 * the actual value printed beside it, so off-scale draws are marked rather
 * than hidden. Labels skip neighbors closer than 70px; the arrows remain.
 */
export function drawOffScaleMarkers(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  xScale: NumericScale,
  yScale: NumericScale,
  events: OffScaleEvent[],
  style: MarkerStyle,
): void {
  if (events.length === 0) return
  const area = plotArea(layout)
  const [d0, d1] = yScale.domain()
  if (d0 === undefined || d1 === undefined) return
  const top = Math.max(d0, d1)
  ctx.save()
  ctx.font = style.font

  /* Two passes so a later arrow never stamps over an earlier label. */
  ctx.fillStyle = style.color
  for (const event of events) {
    const x = xScale(event.n)
    const up = event.value > top
    const edgeY = up ? area.y + 2 : area.y + area.h - 2
    const dir = up ? 1 : -1
    ctx.beginPath()
    ctx.moveTo(x, edgeY)
    ctx.lineTo(x - 4.5, edgeY + dir * 7)
    ctx.lineTo(x + 4.5, edgeY + dir * 7)
    ctx.closePath()
    ctx.fill()
  }

  let lastLabelX = -Infinity
  for (const event of events) {
    const x = xScale(event.n)
    if (Math.abs(x - lastLabelX) < 70) continue
    lastLabelX = x
    const up = event.value > top
    const alignRight = x > area.x + area.w - 90
    ctx.textAlign = alignRight ? 'right' : 'left'
    ctx.textBaseline = up ? 'top' : 'bottom'
    const labelX = x + (alignRight ? -9 : 9)
    const labelY = up ? area.y + 2 : area.y + area.h - 2
    const label = style.formatValue(event.value)
    ctx.lineWidth = 3
    ctx.strokeStyle = style.casing
    ctx.strokeText(label, labelX, labelY)
    ctx.fillText(label, labelX, labelY)
  }
  ctx.restore()
}
