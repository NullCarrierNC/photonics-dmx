import * as path from 'path'
import { DmxLightManager } from '../controllers/DmxLightManager'
import { LightStateManager } from '../controllers/sequencer/LightStateManager'
import { LightTransitionController } from '../controllers/sequencer/LightTransitionController'
import { Sequencer } from '../controllers/sequencer/Sequencer'
import type { Clock } from '../controllers/sequencer/Clock'
import { ConfigStrobeType, DmxLight, FixtureTypes, LightingConfiguration, RGBIO } from '../types'
import { NodeCueLoader } from '../cues/node/loader/NodeCueLoader'
import { EffectLoader } from '../cues/node/loader/EffectLoader'
import { YargCueRegistry } from '../cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../cues/registries/AudioCueRegistry'
import { YargCueHandler } from '../cueHandlers/YargCueHandler'
import { noopRuntimeBroadcaster } from '../runtime/broadcaster'
import {
  CueType,
  DRUM_NOTE_MAP,
  INSTRUMENT_NOTE_MAP,
  getCueTypeFromId,
} from '../cues/types/cueTypes'
import { VirtualTime } from './VirtualTime'
import { FrameDriver, FrameState, FrameTransient } from './FrameDriver'
import {
  ScenarioEntry,
  SimLightOrder,
  SimLightSample,
  SimSample,
  SimTimeline,
  VenueSize,
} from './types'

export interface CueSimulatorOptions {
  /** Cue library to simulate: a loaded group id (e.g. `yarg-stagekit`) or its filename. */
  library: string
  /** Root of the cue/effect data tree; defaults to the bundled `resources/defaults`. */
  baseDir?: string
  frontCount?: number
  backCount?: number
  strobeCount?: number
  /** Starting beats-per-minute; 0 disables synthesized beats. */
  bpm?: number
  venue?: VenueSize
  /** Cue re-dispatch (`cue-called`) cadence; mirrors YARG's ~30 Hz frame rate. */
  frameRateHz?: number
  /** How often to capture a light-state sample. */
  sampleIntervalMs?: number
  /** Sequencer frame granularity; production default is 10 ms. */
  frameStepMs?: number
}

interface ResolvedOptions extends Required<Omit<CueSimulatorOptions, 'baseDir'>> {
  baseDir: string
}

const DEFAULT_BASE_DIR = path.resolve(__dirname, '../../../resources/defaults')

const BEATS_PER_MEASURE = 4
const EPSILON = 1e-6

/**
 * Headless, deterministic cue simulator. Loads a bundled cue library through the real
 * loader/registry, runs a chosen cue under virtual time while synthesizing YARG frames and
 * scenario events, and records the resulting per-light RGBIO over time.
 *
 * Usage:
 * ```ts
 * const sim = await CueSimulator.create({ library: 'yarg-stagekit', frontCount: 4, backCount: 4 })
 * sim.setCue('Menu')
 * const timeline = await sim.run(4000)
 * sim.dispose()
 * ```
 */
export class CueSimulator {
  private readonly opts: ResolvedOptions
  private readonly lightManager: DmxLightManager
  private readonly lightStateManager: LightStateManager
  private readonly lightTransitionController: LightTransitionController
  private readonly sequencer: Sequencer
  private readonly handler: YargCueHandler
  private readonly lightOrder: SimLightOrder

  private frameDriver!: FrameDriver
  private groupId = ''
  private loadedGroupIds: string[] = []

  private currentCue: CueType | undefined
  private venue: VenueSize
  private bpm: number
  private vocalActive = false

  private scenario: ScenarioEntry[] = []
  private samples: SimSample[] = []
  private pendingEvents: string[] = []
  private lastSampleSignature: string | null = null
  private lastTimeline: SimTimeline | null = null

  private constructor(
    private readonly virtualTime: VirtualTime,
    opts: ResolvedOptions,
  ) {
    this.opts = opts
    this.venue = opts.venue
    this.bpm = opts.bpm

    const config = CueSimulator.buildConfig(opts.frontCount, opts.backCount, opts.strobeCount)
    this.lightManager = new DmxLightManager(config)
    this.lightStateManager = new LightStateManager()
    this.lightTransitionController = new LightTransitionController(this.lightStateManager)
    this.sequencer = new Sequencer(
      this.lightTransitionController,
      this.virtualTime as unknown as Clock,
    )
    this.handler = new YargCueHandler(this.lightManager, this.sequencer)

    this.lightOrder = {
      front: this.lightManager.getLights(['front'], ['all']).map((l) => l.id),
      back: this.lightManager.getLights(['back'], ['all']).map((l) => l.id),
      strobe: this.lightManager.getLights(['strobe'], ['all']).map((l) => l.id),
    }
  }

  public static async create(options: CueSimulatorOptions): Promise<CueSimulator> {
    const resolved: ResolvedOptions = {
      library: options.library,
      baseDir: options.baseDir ?? DEFAULT_BASE_DIR,
      frontCount: options.frontCount ?? 4,
      backCount: options.backCount ?? 4,
      strobeCount: options.strobeCount ?? 0,
      bpm: options.bpm ?? 120,
      venue: options.venue ?? 'Large',
      frameRateHz: options.frameRateHz ?? 30,
      sampleIntervalMs: options.sampleIntervalMs ?? 50,
      frameStepMs: options.frameStepMs ?? 10,
    }

    const virtualTime = new VirtualTime({ frameStepMs: resolved.frameStepMs })
    virtualTime.install()
    try {
      const sim = new CueSimulator(virtualTime, resolved)
      await sim.init()
      return sim
    } catch (error) {
      virtualTime.dispose()
      throw error
    }
  }

  private async init(): Promise<void> {
    const registry = YargCueRegistry.getInstance()
    registry.reset()

    const effectLoader = new EffectLoader({ baseDir: this.opts.baseDir })
    const loader = new NodeCueLoader({
      baseDir: this.opts.baseDir,
      yargRegistry: registry,
      audioRegistry: AudioCueRegistry.getInstance(),
      effectLoader,
      runtimeBroadcaster: noopRuntimeBroadcaster(),
    })
    await loader.loadAll()

    const summaries = loader.getSummary().yarg
    this.loadedGroupIds = summaries.map((s) => s.groupId)
    const fileToGroup = new Map<string, string>()
    for (const summary of summaries) {
      fileToGroup.set(path.basename(summary.path, '.json'), summary.groupId)
    }

    const requested = this.opts.library
    const resolvedGroupId = registry.getGroup(requested) ? requested : fileToGroup.get(requested)
    if (!resolvedGroupId || !registry.getGroup(resolvedGroupId)) {
      const available = Array.from(
        new Set([...this.loadedGroupIds, ...Array.from(fileToGroup.keys())]),
      ).sort()
      throw new Error(
        `Cue library '${requested}' not found. Available libraries: ${available.join(', ')}`,
      )
    }
    this.groupId = resolvedGroupId

    this.frameDriver = new FrameDriver(this.handler, () => this.getFrameState(), this.groupId)
  }

  private getFrameState(): FrameState {
    if (this.currentCue === undefined) {
      throw new Error('No cue selected. Call setCue() before running the simulation.')
    }
    return {
      cue: this.currentCue,
      venue: this.venue,
      bpm: this.bpm,
      vocalActive: this.vocalActive,
    }
  }

  /** Select the cue to simulate. Accepts any {@link CueType} value (e.g. `Menu`, `Strobe_Fast`). */
  public setCue(cue: string): void {
    this.currentCue = this.resolveCueType(cue)
  }

  /** Queue a scenario step (event injection or live state change) at `entry.at` ms. */
  public schedule(entry: ScenarioEntry): void {
    this.scenario.push(entry)
  }

  /** Replace the scenario with the given steps. */
  public loadScenario(entries: ScenarioEntry[]): void {
    this.scenario = [...entries]
  }

  public get groupName(): string {
    return this.groupId
  }

  public getLightState(lightId: string): RGBIO | null {
    return this.lightStateManager.getLightState(lightId)
  }

  /**
   * Run the simulation for `durationMs` of virtual time, returning the recorded timeline.
   * Beats are synthesized from BPM, cue frames re-dispatched at `frameRateHz`, scenario steps
   * applied at their scheduled times, and light states sampled at `sampleIntervalMs`.
   */
  public async run(durationMs: number): Promise<SimTimeline> {
    if (this.currentCue === undefined) {
      throw new Error('No cue selected. Call setCue() before run().')
    }

    this.samples = []
    this.pendingEvents = []
    this.lastSampleSignature = null

    const startTime = this.virtualTime.getCurrentTimeMs()
    const endTime = startTime + durationMs
    const sustainInterval = 1000 / this.opts.frameRateHz

    const pending = this.scenario
      .map((entry) => ({ entry, absAt: startTime + entry.at }))
      .sort((a, b) => a.absAt - b.absAt)
    let scenarioIdx = 0

    let nextSustain = startTime
    let nextSample = startTime
    let nextBeat = this.bpm > 0 ? startTime : Infinity
    let beatCounter = 0

    while (this.virtualTime.getCurrentTimeMs() < endTime - EPSILON) {
      const now = this.virtualTime.getCurrentTimeMs()
      const nextScenario = scenarioIdx < pending.length ? pending[scenarioIdx].absAt : Infinity
      const target = Math.min(nextSustain, nextSample, nextBeat, nextScenario, endTime)
      if (target > now + EPSILON) {
        await this.virtualTime.advance(target - now)
      }
      const t = this.virtualTime.getCurrentTimeMs()

      while (scenarioIdx < pending.length && pending[scenarioIdx].absAt <= t + EPSILON) {
        await this.applyScenario(pending[scenarioIdx].entry)
        scenarioIdx++
      }

      // A BPM change (incl. starting from 0) re-arms the beat scheduler.
      if (this.bpm > 0 && nextBeat === Infinity) {
        nextBeat = t + 60000 / this.bpm
      } else if (this.bpm <= 0) {
        nextBeat = Infinity
      }

      if (nextBeat <= t + EPSILON && this.bpm > 0) {
        const isMeasure = beatCounter % BEATS_PER_MEASURE === 0
        await this.frameDriver.dispatch({ beat: isMeasure ? 'Measure' : 'Strong' })
        beatCounter++
        nextBeat += 60000 / this.bpm
      }

      if (nextSustain <= t + EPSILON) {
        await this.frameDriver.dispatch({})
        nextSustain += sustainInterval
      }

      if (nextSample <= t + EPSILON) {
        this.recordSample(t)
        nextSample += this.opts.sampleIntervalMs
      }
    }

    this.recordSample(this.virtualTime.getCurrentTimeMs(), true)

    this.lastTimeline = {
      cue: this.currentCue,
      library: this.groupId,
      venue: this.venue,
      bpm: this.bpm,
      durationMs,
      sampleIntervalMs: this.opts.sampleIntervalMs,
      frameRateHz: this.opts.frameRateHz,
      lightOrder: this.lightOrder,
      samples: this.samples,
    }
    return this.lastTimeline
  }

  public get timeline(): SimTimeline | null {
    return this.lastTimeline
  }

  /** Tear down the sequencer/handler and restore real timers. Safe to call once. */
  public dispose(): void {
    try {
      this.handler.shutdown()
      this.sequencer.shutdown()
      const registry = YargCueRegistry.getInstance()
      registry.releaseSequencerFromAllCues(this.sequencer)
      for (const id of this.loadedGroupIds) {
        registry.unregisterGroup(id)
      }
      registry.reset()
      this.lightStateManager.shutdown()
    } finally {
      this.virtualTime.dispose()
    }
  }

  private async applyScenario(entry: ScenarioEntry): Promise<void> {
    if (entry.cue !== undefined) {
      this.handler.stopActiveCue()
      this.currentCue = this.resolveCueType(entry.cue)
      this.pendingEvents.push(`cue=${entry.cue}`)
    }
    if (entry.bpm !== undefined) {
      this.bpm = entry.bpm
      this.pendingEvents.push(`bpm=${entry.bpm}`)
    }
    if (entry.venue !== undefined) {
      this.venue = entry.venue
      this.pendingEvents.push(`venue=${entry.venue}`)
    }
    if (entry.event !== undefined) {
      await this.applyEvent(entry.event)
    }
  }

  private async applyEvent(event: string): Promise<void> {
    this.pendingEvents.push(event)

    if (event === 'vocal-note') {
      this.vocalActive = true
      await this.frameDriver.dispatch({})
      return
    }
    if (event === 'vocal-note-off') {
      this.vocalActive = false
      await this.frameDriver.dispatch({})
      return
    }
    if (event === 'beat') {
      await this.frameDriver.dispatch({ beat: 'Strong' })
      return
    }
    if (event === 'measure') {
      await this.frameDriver.dispatch({ beat: 'Measure' })
      return
    }
    if (event === 'keyframe-first') {
      await this.frameDriver.dispatch({ keyframe: 'First' })
      return
    }
    if (event === 'keyframe-next') {
      await this.frameDriver.dispatch({ keyframe: 'Next' })
      return
    }
    if (event === 'keyframe-previous') {
      await this.frameDriver.dispatch({ keyframe: 'Previous' })
      return
    }

    const transient = CueSimulator.instrumentEventToTransient(event)
    if (transient) {
      await this.frameDriver.dispatch(transient)
      return
    }

    throw new Error(`Unknown scenario event: '${event}'`)
  }

  private static instrumentEventToTransient(event: string): FrameTransient | null {
    if (event.startsWith('drum-')) {
      const note = DRUM_NOTE_MAP[event.slice('drum-'.length)]
      return note ? { drumNotes: [note] } : null
    }
    if (event.startsWith('guitar-')) {
      const note = INSTRUMENT_NOTE_MAP[event.slice('guitar-'.length)]
      return note ? { guitarNotes: [note] } : null
    }
    if (event.startsWith('bass-')) {
      const note = INSTRUMENT_NOTE_MAP[event.slice('bass-'.length)]
      return note ? { bassNotes: [note] } : null
    }
    if (event.startsWith('keys-')) {
      const note = INSTRUMENT_NOTE_MAP[event.slice('keys-'.length)]
      return note ? { keysNotes: [note] } : null
    }
    return null
  }

  private recordSample(timeMs: number, force = false): void {
    const lights: Record<string, SimLightSample | null> = {}
    const allIds = [...this.lightOrder.front, ...this.lightOrder.back, ...this.lightOrder.strobe]
    for (const id of allIds) {
      const state = this.lightStateManager.getLightState(id)
      lights[id] = state
        ? {
            red: Math.round(state.red),
            green: Math.round(state.green),
            blue: Math.round(state.blue),
            intensity: Math.round(state.intensity),
            opacity: Number(state.opacity.toFixed(3)),
            blendMode: state.blendMode,
          }
        : null
    }

    const signature = JSON.stringify(lights)
    const events = this.pendingEvents
    this.pendingEvents = []

    // Drop rows identical to the previous one unless they carry an event or are forced (final row).
    if (!force && events.length === 0 && signature === this.lastSampleSignature) {
      return
    }
    this.lastSampleSignature = signature
    this.samples.push({ timeMs: Math.round(timeMs), lights, events })
  }

  private resolveCueType(cue: string): CueType {
    const cueType = getCueTypeFromId(cue)
    if (!cueType) {
      throw new Error(`Unknown cue '${cue}'. Expected a CueType value (e.g. Menu, Intro, Default).`)
    }
    return cueType
  }

  private static buildConfig(
    frontCount: number,
    backCount: number,
    strobeCount: number,
  ): LightingConfiguration {
    const makeLights = (count: number, group: 'front' | 'back' | 'strobe', start: number) =>
      Array.from({ length: count }, (_, index) => {
        const position = start + index + 1
        const base = position * 4 - 3
        return {
          id: `${group}-${position}`,
          name: `${group} ${position}`,
          label: `${group} ${position}`,
          isStrobeEnabled: group === 'strobe',
          universe: 1,
          fixture: FixtureTypes.RGB,
          group,
          position,
          channels: {
            red: base,
            green: base + 1,
            blue: base + 2,
            masterDimmer: base + 3,
          },
          fixtureId: `${group}-${position}`,
        } as DmxLight
      })

    const frontLights = makeLights(frontCount, 'front', 0)
    const backLights = makeLights(backCount, 'back', frontCount)
    const strobeLights = makeLights(strobeCount, 'strobe', frontCount + backCount)

    return {
      numLights: frontCount + backCount + strobeCount,
      lightLayout: { id: 'two-rows', label: 'Two Rows (one in front of the other)' },
      strobeType: ConfigStrobeType.None,
      frontLights,
      backLights,
      strobeLights,
    }
  }
}
