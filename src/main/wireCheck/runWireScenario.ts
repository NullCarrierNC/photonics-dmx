import * as fs from 'fs'
import * as path from 'path'
import { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import {
  loadDmxFixture,
  parseFixtureList,
  type FixtureFault,
} from '../../photonics-dmx/helpers/fixtureParsing'
import { NodeCueLoader } from '../../photonics-dmx/cues/node/loader/NodeCueLoader'
import { EffectLoader } from '../../photonics-dmx/cues/node/loader/EffectLoader'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { getCueRegistry } from '../../photonics-dmx/cues/registries/cueRegistries'
import { noopRuntimeBroadcaster } from '../../photonics-dmx/runtime/broadcaster'
import { VirtualTime } from '../../photonics-dmx/sim/VirtualTime'
import { RealTimeClock, type WireClock } from '../../photonics-dmx/sim/wire/RealTimeClock'
import { WireRun, type WireSend } from '../../photonics-dmx/sim/wire/WireRun'
import { playStep } from '../../photonics-dmx/sim/wire/playStep'
import type { DmxLight } from '../../photonics-dmx/types'
import { rigFiles, scenarioProblems, type WireScenario } from './wireScenario'

const BUNDLED = path.resolve(__dirname, '../../../resources/defaults')

/** What a scenario sent to the wire, on the virtual clock from 0 ms. */
interface WireRecording {
  name: string
  universe: number
  sends: WireSend[]
  /** The time each step's mark started, by mark name. */
  marks: Record<string, number>
  endMs: number
  /** The rig lights as the app loaded them, each time the rig started. */
  rigStarts: Array<{ atMs: number; lights: Array<Pick<DmxLight, 'id' | 'channels'>> }>
}

function writeConfigFiles(appDataDir: string, files: Record<string, unknown>): void {
  const configDir = path.join(appDataDir, 'Photonics.rocks')
  fs.mkdirSync(configDir, { recursive: true })
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(configDir, name), JSON.stringify(body, null, 2))
  }
}

/** A copy of the bundled node data with `cueFiles` written over it, for scenario-only cues. */
function layeredNodeData(dir: string, cueFiles: Record<string, unknown>): string {
  const baseDir = path.join(dir, 'cue-data')
  fs.cpSync(path.join(BUNDLED, 'node-data'), path.join(baseDir, 'node-data'), { recursive: true })
  for (const [file, body] of Object.entries(cueFiles)) {
    const target = path.join(baseDir, 'node-data', file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, JSON.stringify(body))
  }
  return baseDir
}

async function loadCueLibraries(baseDir: string): Promise<void> {
  getCueRegistry('yarg').reset()
  getCueRegistry('rb3').reset()
  AudioCueRegistry.getInstance().reset()
  const loader = new NodeCueLoader({
    baseDir,
    registries: {
      yarg: getCueRegistry('yarg'),
      rb3: getCueRegistry('rb3'),
      audio: AudioCueRegistry.getInstance(),
    },
    effectLoader: new EffectLoader({ baseDir }),
    runtimeBroadcaster: noopRuntimeBroadcaster(),
  })
  await loader.loadAll()
}

interface WireRunMode {
  /** Hands each publisher buffer to a real sender as well, and runs in real time. */
  forward?: (buffer: Record<number, number>) => Promise<boolean>
}

/**
 * Runs a scenario the way the app runs a rig: its config files load through the real
 * ConfigurationManager, and each step drives the rig's cue handlers on a virtual clock while the
 * publisher's sends are recorded. A `saveTemplates` step saves through My Lights' path and
 * restarts the rig, as the app's controllers restart on a template save. With `forward`, the run
 * is on the app's real clock so a real sender keeps the app's pace.
 *
 * `app.getPath('appData')` must return `appDataDir`: the CLI worker and the tests stub electron
 * that way. Each run starts from fresh config files in that folder.
 */
export async function runWireScenario(
  scenario: WireScenario,
  appDataDir: string,
  mode: WireRunMode = {},
): Promise<WireRecording> {
  const problems = scenarioProblems(scenario)
  if (problems.length > 0) {
    throw new Error(`Scenario '${String(scenario.name)}': ${problems.join('; ')}`)
  }
  writeConfigFiles(appDataDir, scenario.files ?? (scenario.rig ? rigFiles(scenario.rig) : {}))
  const baseDir = scenario.cueFiles ? layeredNodeData(appDataDir, scenario.cueFiles) : BUNDLED

  let clock: WireClock
  if (mode.forward) {
    clock = new RealTimeClock()
  } else {
    const virtualTime = new VirtualTime({ frameStepMs: 10 })
    virtualTime.install()
    clock = virtualTime
  }
  try {
    await loadCueLibraries(baseDir)
    const config = new ConfigurationManager()
    const recording: WireRecording = {
      name: scenario.name,
      universe: scenario.universe ?? 1,
      sends: [],
      marks: {},
      endMs: 0,
      rigStarts: [],
    }
    // The last teardown blacks the publisher out, which is the end of the run, not its output.
    let recordingSends = true
    const startRig = (): WireRun => {
      const rig = config.getActiveRigs()[0]
      if (!rig) {
        throw new Error(`Scenario '${scenario.name}' has no active rig`)
      }
      recording.rigStarts.push({
        atMs: clock.getCurrentTimeMs(),
        lights: [...rig.config.frontLights, ...rig.config.backLights].map(({ id, channels }) => ({
          id,
          channels,
        })),
      })
      return new WireRun({
        rig,
        clock,
        onSend: (send) => {
          if (recordingSends) recording.sends.push(send)
        },
        forward: (buffer) =>
          recordingSends && mode.forward ? mode.forward(buffer) : Promise.resolve(true),
        outputRateHz: scenario.outputRateHz,
        yargLibrary: scenario.yargLibrary,
        audioLibrary: scenario.audioLibrary,
        motion: scenario.motion ?? null,
      })
    }

    let run: WireRun | null = startRig()
    try {
      for (const step of scenario.steps) {
        if (step.mark !== undefined) {
          recording.marks[step.mark] = clock.getCurrentTimeMs()
        }
        if (step.type !== 'saveTemplates') {
          await playStep(run, clock, step)
          continue
        }
        const faults: FixtureFault[] = []
        const templates = parseFixtureList(step.templates, 'templates', loadDmxFixture, faults)
        if (!templates.ok) {
          throw new Error(`Scenario '${scenario.name}': ${templates.error}`)
        }
        run.dispose()
        run = null
        await config.saveUserLights(templates.value)
        run = startRig()
      }
      recording.endMs = clock.getCurrentTimeMs()
    } finally {
      recordingSends = false
      run?.dispose()
    }
    return recording
  } finally {
    if (clock instanceof VirtualTime) {
      clock.dispose()
    } else {
      clock.destroy()
    }
  }
}
