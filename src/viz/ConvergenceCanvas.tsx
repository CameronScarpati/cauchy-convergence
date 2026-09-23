import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import type { Readout, SimConfig } from '../config.ts'
import { mulberry32, type Rng } from '../sim/prng.ts'
import { cauchySample, normalSample } from '../sim/sampling.ts'
import {
  createRunningMean,
  createRunningMedian,
  mean,
  meanPush,
  median,
  medianPush,
  type RunningMean,
  type RunningMedian,
} from '../sim/runningStats.ts'
import { readToken } from '../theme/theme.ts'
import {
  DEFAULT_MARGIN,
  clearCanvas,
  drawAxes,
  drawGrid,
  drawNormalBand,
  drawOffScaleMarkers,
  drawTargetLine,
  drawTrace,
  type ChartLayout,
  type OffScaleEvent,
} from './draw.ts'
import {
  formatReadout,
  isOffScale,
  makeXScale,
  makeYScale,
  yTickValues,
  type NumericScale,
} from './scales.ts'
import { useAnimationLoop } from './useAnimationLoop.ts'
import { watchDevicePixelRatio } from './watchDevicePixelRatio.ts'

interface RunState {
  rng: Rng
  meanAcc: RunningMean
  medianAcc: RunningMedian
  meanTrace: Float64Array
  medianTrace: Float64Array
  offScale: OffScaleEvent[]
  offScaleCount: number
  lastValue: number
}

interface SimState {
  runs: RunState[]
  count: number
  acc: number
}

interface ViewState {
  layout: ChartLayout
  x: NumericScale
  y: NumericScale
  bg: CanvasRenderingContext2D
  fg: CanvasRenderingContext2D
  palette: {
    grid: string
    label: string
    target: string
    cauchy: string
    normal: string
    surface: string
    monoFont: string
  }
}

const MAX_MARKERS = 5
const FRAME_BUDGET_MS = 8
/* Finished runs hold briefly, then replay the same seed so the chart
   keeps moving while the page is read. */
const REPLAY_HOLD_MS = 2000

function sizeCanvas(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

interface ConvergenceCanvasProps {
  config: SimConfig
  /* Bump to replay the current seed from sample zero. */
  restartToken?: number
  /* Freezes sampling and the replay countdown; drawing still responds to
     resize and theme changes. */
  paused?: boolean
  onReadout?: (readout: Readout) => void
}

export function ConvergenceCanvas({
  config,
  restartToken = 0,
  paused = false,
  onReadout,
}: ConvergenceCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLCanvasElement>(null)
  const fgRef = useRef<HTMLCanvasElement>(null)

  const configRef = useRef(config)
  const onReadoutRef = useRef(onReadout)
  const pausedRef = useRef(paused)
  const simRef = useRef<SimState | null>(null)
  const viewRef = useRef<ViewState | null>(null)
  const dirtyRef = useRef(false)
  const doneAtRef = useRef<number | null>(null)

  const reduced = useReducedMotion() === true

  useEffect(() => {
    configRef.current = config
    onReadoutRef.current = onReadout
    pausedRef.current = paused
  })

  /* All state the loop touches lives in refs; these helpers close over the
     refs only, so effects registered once stay correct. */
  const helpersRef = useRef<{
    rebuildView: () => void
    renderFrame: () => void
    advanceSamples: (k: number) => void
    emitReadout: () => void
    resetSim: () => void
    frame: (dt: number) => void
  } | null>(null)

  if (helpersRef.current === null) {
    const drawStatic = () => {
      const view = viewRef.current
      if (!view) return
      const cfg = configRef.current
      clearCanvas(view.bg, view.layout)
      const ticks = yTickValues(cfg.yMode, view.y)
      drawGrid(view.bg, view.layout, view.y, ticks, view.palette.grid)
      if (cfg.distribution === 'normal') {
        drawNormalBand(
          view.bg,
          view.layout,
          view.x,
          view.y,
          cfg.location,
          cfg.scale,
          cfg.maxSamples,
          view.palette.normal,
        )
      }
      const xTicks =
        cfg.distribution === 'normal'
          ? [1, 10, 100, 1000].filter((v) => v < cfg.maxSamples).concat(cfg.maxSamples)
          : undefined
      drawAxes(
        view.bg,
        view.layout,
        view.x,
        view.y,
        ticks,
        { grid: view.palette.grid, label: view.palette.label },
        view.palette.monoFont,
        xTicks,
      )
      drawTargetLine(view.bg, view.layout, view.y, cfg.location, view.palette.target)
    }

    const rebuildView = () => {
      const wrapper = wrapperRef.current
      const bg = bgRef.current
      const fg = fgRef.current
      if (!wrapper || !bg || !fg) return
      const cfg = configRef.current
      const rect = wrapper.getBoundingClientRect()
      const width = Math.max(rect.width, 200)
      const height = Math.max(rect.height, 160)
      const bgCtx = sizeCanvas(bg, width, height)
      const fgCtx = sizeCanvas(fg, width, height)
      if (!bgCtx || !fgCtx) return
      const layout: ChartLayout = { width, height, margin: DEFAULT_MARGIN }
      const mono = readToken('--font-mono') || 'monospace'
      viewRef.current = {
        layout,
        x: makeXScale(
          cfg.maxSamples,
          [layout.margin.left, width - layout.margin.right],
          cfg.distribution === 'normal' ? 'log' : 'linear',
        ),
        y: makeYScale(
          cfg.yMode,
          cfg.location,
          cfg.scale,
          [height - layout.margin.bottom, layout.margin.top],
          cfg.distribution === 'normal' ? 2.5 : 10,
        ),
        bg: bgCtx,
        fg: fgCtx,
        palette: {
          grid: readToken('--line'),
          label: readToken('--text-muted'),
          target: readToken('--target'),
          cauchy: readToken('--cauchy'),
          normal: readToken('--normal'),
          surface: readToken('--surface'),
          monoFont: `500 11px ${mono}`,
        },
      }
      drawStatic()
      dirtyRef.current = true
    }

    const renderFrame = () => {
      const view = viewRef.current
      const sim = simRef.current
      if (!view || !sim) return
      const cfg = configRef.current
      clearCanvas(view.fg, view.layout)
      const hue = cfg.distribution === 'cauchy' ? view.palette.cauchy : view.palette.normal
      for (let i = sim.runs.length - 1; i >= 0; i--) {
        const run = sim.runs[i]
        if (!run) continue
        const alpha = i === 0 ? 1 : 0.3
        drawTrace(view.fg, view.layout, view.x, view.y, run.meanTrace, sim.count, {
          color: hue,
          width: 2,
          alpha,
        })
        drawTrace(view.fg, view.layout, view.x, view.y, run.medianTrace, sim.count, {
          color: hue,
          width: 2,
          alpha: alpha * 0.85,
          dash: [6, 4],
        })
      }
      const primary = sim.runs[0]
      if (primary) {
        drawOffScaleMarkers(view.fg, view.layout, view.x, view.y, primary.offScale, {
          color: hue,
          casing: view.palette.surface,
          font: view.palette.monoFont,
          formatValue: formatReadout,
        })
      }
      dirtyRef.current = false
    }

    const advanceSamples = (k: number) => {
      const sim = simRef.current
      const view = viewRef.current
      if (!sim) return
      const cfg = configRef.current
      const steps = Math.min(k, cfg.maxSamples - sim.count)
      for (let s = 0; s < steps; s++) {
        for (let i = 0; i < sim.runs.length; i++) {
          const run = sim.runs[i]
          if (!run) continue
          const value =
            cfg.distribution === 'cauchy'
              ? cauchySample(run.rng, cfg.location, cfg.scale)
              : normalSample(run.rng, cfg.location, cfg.scale)
          meanPush(run.meanAcc, value)
          medianPush(run.medianAcc, value)
          const meanNow = mean(run.meanAcc)
          run.meanTrace[sim.count] = meanNow
          run.medianTrace[sim.count] = median(run.medianAcc)
          run.lastValue = value
          if (i === 0 && view) {
            const runaway = isOffScale(view.y, value)
              ? value
              : isOffScale(view.y, meanNow)
                ? meanNow
                : null
            if (runaway !== null) {
              run.offScaleCount += 1
              run.offScale.push({ n: sim.count + 1, value: runaway })
              if (run.offScale.length > MAX_MARKERS) run.offScale.shift()
            }
          }
        }
        sim.count += 1
      }
      if (steps > 0) dirtyRef.current = true
    }

    const emitReadout = () => {
      const sim = simRef.current
      const emit = onReadoutRef.current
      if (!sim || !emit) return
      const primary = sim.runs[0]
      if (!primary) return
      const cfg = configRef.current
      emit({
        n: sim.count,
        mean: mean(primary.meanAcc),
        median: median(primary.medianAcc),
        lastValue: primary.lastValue,
        offScaleCount: primary.offScaleCount,
        done: sim.count >= cfg.maxSamples,
      })
    }

    const resetSim = () => {
      const cfg = configRef.current
      doneAtRef.current = null
      simRef.current = {
        acc: 0,
        count: 0,
        runs: Array.from({ length: Math.max(1, cfg.runs) }, (_, i) => ({
          rng: mulberry32((cfg.seed + i * 0x9e3779b9) >>> 0),
          meanAcc: createRunningMean(),
          medianAcc: createRunningMedian(),
          meanTrace: new Float64Array(cfg.maxSamples),
          medianTrace: new Float64Array(cfg.maxSamples),
          offScale: [],
          offScaleCount: 0,
          lastValue: NaN,
        })),
      }
      dirtyRef.current = true
    }

    const frame = (dt: number) => {
      const sim = simRef.current
      if (!sim) return
      if (pausedRef.current) {
        if (dirtyRef.current) renderFrame()
        return
      }
      const cfg = configRef.current
      if (sim.count < cfg.maxSamples) {
        doneAtRef.current = null
        sim.acc = Math.min(sim.acc + dt, 1000)
        const step = 1000 / cfg.samplesPerSecond
        const pending = Math.floor(sim.acc / step)
        if (pending > 0) {
          const budget = performance.now() + FRAME_BUDGET_MS
          let advanced = 0
          while (advanced < pending && performance.now() < budget) {
            const chunk = Math.min(64, pending - advanced)
            advanceSamples(chunk)
            advanced += chunk
          }
          sim.acc -= advanced * step
        }
      } else if (doneAtRef.current === null) {
        doneAtRef.current = performance.now()
      } else if (performance.now() - doneAtRef.current > REPLAY_HOLD_MS) {
        resetSim()
      }
      if (dirtyRef.current) renderFrame()
    }

    helpersRef.current = { rebuildView, renderFrame, advanceSamples, emitReadout, resetSim, frame }
  }

  const helpers = helpersRef.current

  /* Full reset: the experiment itself changed, or a replay was requested. */
  const resetKey = [
    config.distribution,
    config.location,
    config.scale,
    config.seed,
    config.runs,
    config.maxSamples,
    restartToken,
  ].join('|')

  useEffect(() => {
    helpers.resetSim()
    helpers.rebuildView()
    if (reduced) helpers.advanceSamples(configRef.current.maxSamples)
    helpers.renderFrame()
    helpers.emitReadout()
  }, [resetKey, reduced, helpers])

  /* Axis mode change only rebuilds scales and redraws; the run continues. */
  useEffect(() => {
    helpers.rebuildView()
    const sim = simRef.current
    const view = viewRef.current
    const primary = sim?.runs[0]
    if (primary && view) {
      primary.offScale = primary.offScale.filter((e) => isOffScale(view.y, e.value))
    }
    helpers.renderFrame()
  }, [config.yMode, helpers])

  /* Resize and theme switches redraw both layers from current state. */
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const redraw = () => {
      helpers.rebuildView()
      helpers.renderFrame()
    }
    const resizeObserver = new ResizeObserver(redraw)
    resizeObserver.observe(wrapper)
    const stopDprWatch = watchDevicePixelRatio(redraw)
    const themeObserver = new MutationObserver(redraw)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => {
      resizeObserver.disconnect()
      stopDprWatch()
      themeObserver.disconnect()
    }
  }, [helpers])

  useEffect(() => {
    const id = window.setInterval(helpers.emitReadout, 250)
    return () => window.clearInterval(id)
  }, [helpers])

  useAnimationLoop(helpers.frame, !reduced)

  const distributionName = config.distribution === 'cauchy' ? 'Cauchy' : 'Normal'
  return (
    <div
      ref={wrapperRef}
      className="convergence-canvas"
      role="img"
      aria-label={`Streaming chart of the running mean and running median of seeded ${distributionName} samples against the dashed location line`}
    >
      <canvas ref={bgRef} aria-hidden="true" />
      <canvas ref={fgRef} aria-hidden="true" />
    </div>
  )
}
