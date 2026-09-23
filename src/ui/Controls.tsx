import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { PRESETS, type SimConfig } from '../config.ts'

const SPEED_STOPS = [25, 50, 100, 250, 500, 1000, 2000]

const EASE_OUT = [0.22, 1, 0.36, 1] as const

const railVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE_OUT } },
}

function matchesPreset(config: SimConfig, preset: SimConfig): boolean {
  return (Object.keys(preset) as Array<keyof SimConfig>).every((k) => config[k] === preset[k])
}

interface ControlsProps {
  config: SimConfig
  paused: boolean
  onChange: (patch: Partial<SimConfig>) => void
  onPreset: (config: SimConfig) => void
  onTogglePause: () => void
  onRestart: () => void
  onReseed: () => void
}

export function Controls({
  config,
  paused,
  onChange,
  onPreset,
  onTogglePause,
  onRestart,
  onReseed,
}: ControlsProps) {
  const [seedText, setSeedText] = useState(String(config.seed))
  const reduced = useReducedMotion() === true

  useEffect(() => {
    setSeedText(String(config.seed))
  }, [config.seed])

  const commitSeed = () => {
    const parsed = Number.parseInt(seedText, 10)
    if (Number.isFinite(parsed) && parsed >= 0) {
      onChange({ seed: parsed >>> 0 })
    } else {
      setSeedText(String(config.seed))
    }
  }

  const speedIndex = SPEED_STOPS.indexOf(config.samplesPerSecond)

  return (
    <motion.form
      className="controls"
      onSubmit={(event) => event.preventDefault()}
      variants={railVariants}
      initial={reduced ? false : 'hidden'}
      animate="show"
    >
      <motion.fieldset className="segmented-group" variants={itemVariants}>
        <legend>Classroom presets</legend>
        <div className="preset-row">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={matchesPreset(config, preset.config) ? 'preset preset-active' : 'preset'}
              title={preset.note}
              onClick={() => onPreset(preset.config)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </motion.fieldset>

      <motion.fieldset className="segmented-group" variants={itemVariants}>
        <legend>Distribution</legend>
        <div className="segmented">
          <label>
            <input
              type="radio"
              name="distribution"
              checked={config.distribution === 'cauchy'}
              /* Each distribution brings its natural axis: symlog absorbs
                 Cauchy spikes, a tight linear frame shows the Normal
                 mean actually settling. The toggle stays free after. */
              onChange={() => onChange({ distribution: 'cauchy', yMode: 'symlog' })}
            />
            <span>Cauchy</span>
          </label>
          <label>
            <input
              type="radio"
              name="distribution"
              checked={config.distribution === 'normal'}
              onChange={() => onChange({ distribution: 'normal', yMode: 'linear' })}
            />
            <span>Normal</span>
          </label>
        </div>
      </motion.fieldset>

      <motion.label className="control" variants={itemVariants}>
        <span className="control-line">
          Location
          <output>{config.location.toFixed(1)}</output>
        </span>
        <input
          type="range"
          min={-5}
          max={5}
          step={0.1}
          value={config.location}
          onChange={(event) => onChange({ location: Number(event.target.value) })}
        />
      </motion.label>

      <motion.label className="control" variants={itemVariants}>
        <span className="control-line">
          Scale
          <output>{config.scale.toFixed(1)}</output>
        </span>
        <input
          type="range"
          min={0.1}
          max={5}
          step={0.1}
          value={config.scale}
          onChange={(event) => onChange({ scale: Number(event.target.value) })}
        />
      </motion.label>

      <motion.label className="control" variants={itemVariants}>
        <span className="control-line">
          Speed
          <output>{config.samplesPerSecond} samples/s</output>
        </span>
        <input
          type="range"
          min={0}
          max={SPEED_STOPS.length - 1}
          step={1}
          value={speedIndex === -1 ? 3 : speedIndex}
          onChange={(event) => {
            const next = SPEED_STOPS[Number(event.target.value)]
            if (next !== undefined) onChange({ samplesPerSecond: next })
          }}
        />
      </motion.label>

      <motion.label className="control" variants={itemVariants}>
        <span className="control-line">
          Overlaid runs
          <output>{config.runs}</output>
        </span>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={config.runs}
          onChange={(event) => onChange({ runs: Number(event.target.value) })}
        />
      </motion.label>

      <motion.fieldset className="segmented-group" variants={itemVariants}>
        <legend>Vertical axis</legend>
        <div className="segmented">
          <label>
            <input
              type="radio"
              name="ymode"
              checked={config.yMode === 'symlog'}
              onChange={() => onChange({ yMode: 'symlog' })}
            />
            <span>Symmetric log</span>
          </label>
          <label>
            <input
              type="radio"
              name="ymode"
              checked={config.yMode === 'linear'}
              onChange={() => onChange({ yMode: 'linear' })}
            />
            <span>Linear, clipped</span>
          </label>
        </div>
      </motion.fieldset>

      <motion.div className="control-row" variants={itemVariants}>
        <label className="seed-field">
          <span>Seed</span>
          <input
            type="text"
            inputMode="numeric"
            value={seedText}
            onChange={(event) => setSeedText(event.target.value)}
            onBlur={commitSeed}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitSeed()
            }}
          />
        </label>
        <button type="button" onClick={onTogglePause}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" onClick={onRestart}>
          Restart
        </button>
        <button type="button" onClick={onReseed}>
          Reseed
        </button>
      </motion.div>
    </motion.form>
  )
}
