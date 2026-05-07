import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DmxLight,
  FixtureConfig,
  FixtureTypes,
  LightingConfiguration,
  normalizeFixtureConfig,
  RgbMovingHeadDmxChannels,
  RgbwMovingHeadDmxChannels,
} from '../../../photonics-dmx/types'
import {
  mirrorDmxForMovingHeadInvert,
  percentToDmx,
} from '../../../photonics-dmx/helpers/dmxHelpers'
import {
  motorDegFromPanDmx,
  motorDegFromTiltDmx,
  rawDmxToLogicalHomePercent,
} from '../../../photonics-dmx/helpers/movingHeadCalibration'
import {
  enableConsole,
  disableConsole,
  sendConsoleDmx,
  setConsoleFixtureConfig,
  enableSender,
} from '../ipcApi'
import type { IpcSenderConfig } from '../../../photonics-dmx/types'
import { panTiltDmxToSphericalXY, panTiltDmxToWizardMotorSpaceXY } from './LightsDmxPreview'
import SacnToggle from './SacnToggle'
import ArtNetToggle from './ArtNetToggle'
import EnttecProToggle from './EnttecProToggle'
import OpenDmxToggle from './OpenDmxToggle'
import LightsDmxPreview3D from './LightsDmxPreview3D'
import { MotorEdgeHomeWarnings } from './MotorEdgeHomeWarnings'

const STEP_TITLES = [
  'Pan range',
  'Tilt range',
  'Pan direction',
  'Firing direction',
  'Pan upstage reference',
  'Tilt vertical reference',
  'Home position',
  'Review',
] as const

const REVIEW_STEP = STEP_TITLES.length - 1

/** Steps where the user must press a capture button before Next is enabled. */
const STEPS_REQUIRING_SET_CAPTURE = new Set([4, 5, 6])

function channelsRecord(light: DmxLight): Record<string, number> {
  return light.channels as unknown as Record<string, number>
}

function buildInitialConsoleBuffer(light: DmxLight): Record<number, number> {
  const cfg = normalizeFixtureConfig(light.config)
  const ch = channelsRecord(light)
  const buf: Record<number, number> = {}
  for (const [name, addr] of Object.entries(ch)) {
    if (typeof addr !== 'number' || addr < 1 || addr > 512) continue
    switch (name) {
      case 'masterDimmer':
        buf[addr] = 255
        break
      case 'pan': {
        const logicalDmx = percentToDmx(cfg.panHome, cfg.panMin, cfg.panMax)
        buf[addr] = cfg.invertPan
          ? mirrorDmxForMovingHeadInvert(logicalDmx, cfg.panMin, cfg.panMax)
          : logicalDmx
        break
      }
      case 'tilt': {
        const logicalDmx = percentToDmx(cfg.tiltHome, cfg.tiltMin, cfg.tiltMax)
        buf[addr] = cfg.invertTilt
          ? mirrorDmxForMovingHeadInvert(logicalDmx, cfg.tiltMin, cfg.tiltMax)
          : logicalDmx
        break
      }
      case 'red':
      case 'green':
      case 'blue':
      case 'white':
        buf[addr] = 255
        break
      default:
        buf[addr] = 0
    }
  }
  return buf
}

function DmxSlider(props: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const { label, value, onChange, disabled } = props
  const v = Math.max(0, Math.min(255, Math.round(value)))
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
        <span>{label}</span>
        <span className="font-mono">{v}</span>
      </div>
      <input
        type="range"
        min={0}
        max={255}
        value={v}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full disabled:opacity-50"
      />
    </div>
  )
}

/** First step index where pan/tilt stage references are captured; Home uses stage-relative preview. */
const STAGE_LABELS_READY_STEP = 6

function WizardBeamPreview({
  light,
  buffer,
  config,
  step,
}: {
  light: DmxLight
  buffer: Record<number, number>
  config: FixtureConfig
  step: number
}) {
  const ch = light.channels as RgbMovingHeadDmxChannels | RgbwMovingHeadDmxChannels
  const pan = buffer[ch.pan] ?? 0
  const tilt = buffer[ch.tilt] ?? 0

  const stageLabelsReady = step >= STAGE_LABELS_READY_STEP
  const rawConsoleConfig: FixtureConfig = { ...config, invertPan: false, invertTilt: false }
  const { xPct, yPct } =
    step < STAGE_LABELS_READY_STEP
      ? panTiltDmxToWizardMotorSpaceXY(pan, tilt, rawConsoleConfig)
      : panTiltDmxToSphericalXY(pan, tilt, config)

  let bg = 'rgb(40,40,40)'
  if (light.fixture === FixtureTypes.RGBMH) {
    const r = buffer[ch.red] ?? 0
    const g = buffer[ch.green] ?? 0
    const b = buffer[ch.blue] ?? 0
    const d = buffer[ch.masterDimmer] ?? 0
    const s = d / 255
    bg = `rgb(${Math.round(r * s)}, ${Math.round(g * s)}, ${Math.round(b * s)})`
  } else if (light.fixture === FixtureTypes.RGBWMH) {
    const wch = ch as RgbwMovingHeadDmxChannels
    const r = buffer[ch.red] ?? 0
    const g = buffer[ch.green] ?? 0
    const b = buffer[ch.blue] ?? 0
    const w = buffer[wch.white] ?? 0
    const d = buffer[ch.masterDimmer] ?? 0
    const s = d / 255
    bg = `rgb(${Math.round((r + w) * s)}, ${Math.round((g + w) * s)}, ${Math.round((b + w) * s)})`
  }

  const baseCircleClasses =
    'w-14 h-14 rounded-full flex items-center justify-center text-sm font-semibold shadow-md relative overflow-hidden'

  const labelClass = 'text-[9px] font-medium text-gray-600 dark:text-gray-400 select-none'

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <span className="text-xs text-gray-600 dark:text-gray-400">
        {stageLabelsReady ? 'Beam direction' : 'Motor position'}
      </span>
      <div className="relative flex items-center justify-center w-[5.5rem] h-[5.5rem]">
        {stageLabelsReady ? (
          <>
            <span className={`absolute -top-0.5 left-1/2 -translate-x-1/2 ${labelClass}`}>US</span>
            <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 ${labelClass}`}>DS</span>
            <span className={`absolute left-0 top-1/2 -translate-y-1/2 ${labelClass}`}>SR</span>
            <span className={`absolute right-0 top-1/2 -translate-y-1/2 ${labelClass}`}>SL</span>
          </>
        ) : (
          <span
            className={`absolute -bottom-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap ${labelClass}`}>
            approx. until calibrated
          </span>
        )}
        <div className={baseCircleClasses} style={{ backgroundColor: bg }}>
          <div
            className="absolute rounded-full bg-red-500 z-10"
            style={{
              width: 6,
              height: 6,
              left: `${xPct}%`,
              top: `${yPct}%`,
              transform: 'translate(-50%, -50%)',
              border: '3px solid black',
              boxSizing: 'content-box',
            }}
          />
        </div>
      </div>
    </div>
  )
}

export interface MovingHeadCalibrationWizardProps {
  light: DmxLight
  rigId: string
  /** Rig layout at wizard open (frozen for the 3D preview). */
  lightingConfig: LightingConfiguration
  onClose: () => void
  onComplete: (updatedConfig: FixtureConfig) => void
}

const MovingHeadCalibrationWizard: React.FC<MovingHeadCalibrationWizardProps> = ({
  light,
  rigId,
  lightingConfig,
  onClose,
  onComplete,
}) => {
  const [rigLightingConfigSnapshot] = useState(() => lightingConfig)
  const [step, setStep] = useState(0)
  const [config, setConfig] = useState<FixtureConfig>(() => normalizeFixtureConfig(light.config))
  const [consoleBuffer, setConsoleBuffer] = useState<Record<number, number>>({})
  const [consoleReady, setConsoleReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [stepsConfirmed, setStepsConfirmed] = useState<Set<number>>(() => new Set())

  const ch = light.channels as RgbMovingHeadDmxChannels | RgbwMovingHeadDmxChannels

  const wizard3dLightingConfig = useMemo<LightingConfiguration>(() => {
    const derivedMount: 'floor' | 'ceiling' =
      config.invertPan && config.invertTilt ? 'ceiling' : 'floor'
    const liveLight: DmxLight = { ...light, config, mount: derivedMount }
    const replace = (arr: DmxLight[]): DmxLight[] =>
      arr.map((l) => (l.id && light.id && l.id === light.id ? liveLight : l))
    return {
      ...rigLightingConfigSnapshot,
      frontLights: replace(rigLightingConfigSnapshot.frontLights),
      backLights: replace(rigLightingConfigSnapshot.backLights),
    }
  }, [rigLightingConfigSnapshot, light, config])

  const pushBuffer = useCallback(
    (updater: (prev: Record<number, number>) => Record<number, number>) => {
      setConsoleBuffer((prev) => {
        const next = updater(prev)
        sendConsoleDmx(next)
        return next
      })
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    const snapshot = light
    enableSender({ sender: 'ipc' } as IpcSenderConfig)
    ;(async () => {
      setInitError(null)
      const result = await enableConsole(rigId)
      if (cancelled) return
      if (!result.success) {
        setInitError(result.error)
        return
      }
      const initial = buildInitialConsoleBuffer(snapshot)
      setConsoleBuffer(initial)
      sendConsoleDmx(initial)
      setConsoleReady(true)
    })()
    return () => {
      cancelled = true
      void disableConsole()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-init console when rig or light instance id changes; full `light` would reset on every parent re-render.
  }, [rigId, light.id])

  const setPanDmx = useCallback(
    (dmx: number) => {
      const v = Math.max(0, Math.min(255, Math.round(dmx)))
      pushBuffer((prev) => ({ ...prev, [ch.pan]: v }))
    },
    [ch.pan, pushBuffer],
  )

  const setTiltDmx = useCallback(
    (dmx: number) => {
      const v = Math.max(0, Math.min(255, Math.round(dmx)))
      pushBuffer((prev) => ({ ...prev, [ch.tilt]: v }))
    },
    [ch.tilt, pushBuffer],
  )

  const panDmxLive = consoleBuffer[ch.pan] ?? 0
  const tiltDmxLive = consoleBuffer[ch.tilt] ?? 0

  const canAdvance =
    consoleReady && (!STEPS_REQUIRING_SET_CAPTURE.has(step) || stepsConfirmed.has(step))

  const handleSave = async () => {
    if (!light.id) {
      setSaveError('Light has no id; save the rig first.')
      return
    }
    setSaveError(null)
    setSaving(true)
    try {
      const result = await setConsoleFixtureConfig({
        rigId,
        lightId: light.id,
        fixtureId: light.fixtureId,
        config,
      })
      if (!result.success) {
        setSaveError(result.error)
        return
      }
      await disableConsole()
      onComplete(config)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async () => {
    await disableConsole()
    onClose()
  }

  const progress = (
    <div className="flex gap-1 flex-wrap mb-4">
      {STEP_TITLES.map((t, i) => (
        <span
          key={t}
          className={`text-xs px-2 py-0.5 rounded ${
            i === step
              ? 'bg-blue-600 text-white'
              : i < step
                ? 'bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-100'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
          }`}>
          {i + 1}. {t}
        </span>
      ))}
    </div>
  )

  const preview =
    consoleReady && Object.keys(consoleBuffer).length > 0 ? (
      <WizardBeamPreview light={light} buffer={consoleBuffer} config={config} step={step} />
    ) : null

  let body: React.ReactNode = null

  if (initError) {
    body = (
      <p className="text-red-600 dark:text-red-400 text-sm">
        Could not enable DMX console mode: {initError}
      </p>
    )
  } else if (!consoleReady) {
    body = <p className="text-sm text-gray-600 dark:text-gray-400">Starting console…</p>
  } else {
    switch (step) {
      case 0:
        body = (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Total degrees of pan travel (check your fixture spec sheet, typically 540).
            </p>
            <label className="flex flex-col gap-1 text-sm">
              <span>Pan range (deg)</span>
              <input
                type="number"
                min={1}
                max={720}
                value={config.panRangeDeg}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    panRangeDeg: Math.max(
                      1,
                      Math.min(720, Math.round(Number(e.target.value) || 1)),
                    ),
                  }))
                }
                className="p-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
              />
            </label>
          </div>
        )
        break
      case 1:
        body = (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Total degrees of tilt travel (typically 180 or 270).
            </p>
            <label className="flex flex-col gap-1 text-sm">
              <span>Tilt range (deg)</span>
              <input
                type="number"
                min={1}
                max={360}
                value={config.tiltRangeDeg}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    tiltRangeDeg: Math.max(
                      1,
                      Math.min(360, Math.round(Number(e.target.value) || 1)),
                    ),
                  }))
                }
                className="p-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
              />
            </label>
          </div>
        )
        break
      case 2:
        body = (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Use the slider to move pan. Does the beam rotate <strong>clockwise</strong> when
              viewed from above?
            </p>
            <DmxSlider label="Pan (DMX)" value={panDmxLive} onChange={setPanDmx} />
            <div className="flex items-center gap-3">
              <span className="text-sm">Clockwise when viewed from above</span>
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, panDirectionCW: true }))}
                className={`px-3 py-1 rounded text-sm ${
                  config.panDirectionCW
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100'
                }`}>
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, panDirectionCW: false }))}
                className={`px-3 py-1 rounded text-sm ${
                  !config.panDirectionCW
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100'
                }`}>
                No
              </button>
            </div>
          </div>
        )
        break
      case 3:
        body = (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              How is the fixture mounted? Down-firing (truss/overhead) inverts pan and tilt mapping.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, invertPan: false, invertTilt: false }))}
                className={`px-3 py-2 rounded text-sm text-left ${
                  !config.invertPan && !config.invertTilt
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100'
                }`}>
                Up-firing (floor / stand)
              </button>
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, invertPan: true, invertTilt: true }))}
                className={`px-3 py-2 rounded text-sm text-left ${
                  config.invertPan && config.invertTilt
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100'
                }`}>
                Down-firing (truss / overhead)
              </button>
            </div>
          </div>
        )
        break
      case 4:
        body = (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Use the pan slider to aim the beam directly upstage (toward the screen / stage).
              Adjust tilt if needed, then capture.
            </p>
            <DmxSlider label="Pan (DMX)" value={panDmxLive} onChange={setPanDmx} />
            <DmxSlider label="Tilt (DMX)" value={tiltDmxLive} onChange={setTiltDmx} />
            <button
              type="button"
              onClick={() => {
                setConfig((c) => ({
                  ...c,
                  panStageDeg: Math.round(
                    Math.max(0, Math.min(c.panRangeDeg, motorDegFromPanDmx(panDmxLive, c))),
                  ),
                }))
                setStepsConfirmed((prev) => new Set(prev).add(4))
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
              Set upstage
            </button>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Pan upstage reference: {config.panStageDeg}° (of {config.panRangeDeg}°)
            </p>
          </div>
        )
        break
      case 5:
        body = (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Use the tilt slider to aim the beam at the fixture&apos;s vertical pole (straight up
              in the fixture&apos;s head frame — the direction the engine uses as tilt reference),
              then capture.
            </p>
            <DmxSlider label="Tilt (DMX)" value={tiltDmxLive} onChange={setTiltDmx} />
            <button
              type="button"
              onClick={() => {
                setConfig((c) => ({
                  ...c,
                  tiltStageDeg: Math.round(
                    Math.max(0, Math.min(c.tiltRangeDeg, motorDegFromTiltDmx(tiltDmxLive, c))),
                  ),
                }))
                setStepsConfirmed((prev) => new Set(prev).add(5))
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
              Set vertical
            </button>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Tilt vertical reference: {config.tiltStageDeg}° (of {config.tiltRangeDeg}°)
            </p>
          </div>
        )
        break
      case 6:
        body = (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Use the sliders to aim the beam where you want it to rest by default (idle pose), then
              capture. The preview shows stage-relative beam direction (US / DS / SL / SR) using
              your upstage and vertical references.
            </p>
            <DmxSlider label="Pan (DMX)" value={panDmxLive} onChange={setPanDmx} />
            <DmxSlider label="Tilt (DMX)" value={tiltDmxLive} onChange={setTiltDmx} />
            <button
              type="button"
              onClick={() => {
                setConfig((c) => ({
                  ...c,
                  panHome: Math.round(
                    rawDmxToLogicalHomePercent(panDmxLive, c.panMin, c.panMax, c.invertPan),
                  ),
                  tiltHome: Math.round(
                    rawDmxToLogicalHomePercent(tiltDmxLive, c.tiltMin, c.tiltMax, c.invertTilt),
                  ),
                }))
                setStepsConfirmed((prev) => new Set(prev).add(6))
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
              Set as Home
            </button>
            <MotorEdgeHomeWarnings panHome={config.panHome} tiltHome={config.tiltHome} />
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Pan home {config.panHome}% · Tilt home {config.tiltHome}%
            </p>
          </div>
        )
        break
      case 7:
        body = (
          <div className="space-y-3 text-sm">
            <p className="text-gray-700 dark:text-gray-300">
              Confirm calibration values. Save writes to this rig and the matching My Lights
              template.
            </p>
            <MotorEdgeHomeWarnings panHome={config.panHome} tiltHome={config.tiltHome} />
            <ul className="space-y-1 font-mono text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded max-h-48 overflow-y-auto">
              <li>panRangeDeg: {config.panRangeDeg}</li>
              <li>tiltRangeDeg: {config.tiltRangeDeg}</li>
              <li>panDirectionCW: {String(config.panDirectionCW)}</li>
              <li>
                invertPan / invertTilt: {String(config.invertPan)} / {String(config.invertTilt)}
              </li>
              <li>
                panHome / tiltHome: {config.panHome}% / {config.tiltHome}%
              </li>
              <li>
                panStageDeg / tiltStageDeg: {config.panStageDeg}° / {config.tiltStageDeg}°
              </li>
            </ul>
            {saveError && (
              <p className="text-red-600 dark:text-red-400 text-sm" role="alert">
                {saveError}
              </p>
            )}
          </div>
        )
        break
      default:
        body = null
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={() => void handleCancel()}
      role="presentation">
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="mh-cal-title">
        <h2 id="mh-cal-title" className="text-xl font-bold mb-1 text-gray-900 dark:text-gray-100">
          Calibrate {light.name}
        </h2>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Live DMX console mode — output is manual until you close this wizard.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">DMX Output</span>
          <SacnToggle compact />
          <ArtNetToggle compact />
          <EnttecProToggle compact />
          <OpenDmxToggle compact />
        </div>
        {progress}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1 min-w-0">{body}</div>
          {preview && <div className="flex justify-center sm:justify-end">{preview}</div>}
        </div>
        <div className="flex flex-wrap gap-2 justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-600">
          <button
            type="button"
            onClick={() => void handleCancel()}
            className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500 text-sm">
            Cancel
          </button>
          <div className="flex gap-2">
            {step > 0 && step <= REVIEW_STEP && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={!consoleReady && step > 0}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-sm disabled:opacity-50">
                Back
              </button>
            )}
            {step < REVIEW_STEP && (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50">
                Next
              </button>
            )}
            {step === REVIEW_STEP && consoleReady && (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !!initError}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        </div>
        {consoleReady && step >= STAGE_LABELS_READY_STEP && (
          <div className="mt-4">
            <LightsDmxPreview3D lightingConfig={wizard3dLightingConfig} dmxValues={consoleBuffer} />
          </div>
        )}
      </div>
    </div>
  )
}

export default MovingHeadCalibrationWizard
