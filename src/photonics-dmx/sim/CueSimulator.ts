import * as path from 'path'
import { DmxLightManager } from '../controllers/DmxLightManager'
import { LightStateManager } from '../controllers/sequencer/LightStateManager'
import { LightTransitionController } from '../controllers/sequencer/LightTransitionController'
import { Sequencer } from '../controllers/sequencer/Sequencer'
import { RGBIO } from '../types'
import { NodeCueLoader } from '../cues/node/loader/NodeCueLoader'
import { EffectLoader } from '../cues/node/loader/EffectLoader'
import { AudioCueRegistry } from '../cues/registries/AudioCueRegistry'
import type { IAudioCue } from '../cues/interfaces/IAudioCue'
import type { NetCueMode } from '../cues/types/nodeCueTypes'
import { getCueRegistry } from '../cues/registries/cueRegistries'
import { CueHandler } from '../cueHandlers/CueHandler'
import { AudioCueHandler } from '../cueHandlers/AudioCueHandler'
import { CueStyle, type INetCue } from '../cues/interfaces/INetCue'
import { noopRuntimeBroadcaster } from '../runtime/broadcaster'
import {
  CueType,
  DRUM_NOTE_MAP,
  INSTRUMENT_NOTE_MAP,
  getCueTypeFromId,
  isHandlerOwnedCueType,
} from '../cues/types/cueTypes'
import type { MotionCueRef } from '../cues/types/cueTypes'
import { createAudioMotionCoordinator } from '../cueHandlers/audioMotionCoordinator'
import { VirtualTime } from './VirtualTime'
import { MANUAL_MOTION_TIMING, holdToLibrary, setManualMotion } from './manualMotion'
import { buildSimRig } from './simRig'
import { FrameDriver, FrameState, FrameTransient, SimDriver } from './FrameDriver'
import { AudioFrameDriver, AudioFrameState } from './AudioFrameDriver'
import {
  LedBanks,
  ScenarioEntry,
  SimDomain,
  SimLightOrder,
  SimLightSample,
  SimSample,
  SimSampling,
  SimTimeline,
  VenueSize,
} from './types'

export interface CueSimulatorOptions {
  /** Cue library to simulate: a loaded group id (e.g. `yarg-stagekit`) or its filename. */
  library: string
  /** Which cue domain the library belongs to. Defaults to YARG. */
  domain?: SimDomain
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
  /** How often to capture a light-state sample under interval sampling. */
  sampleIntervalMs?: number
  /**
   * When a row is recorded: `interval` every `sampleIntervalMs`, or `publish` at every light-state
   * publish, which is every state the output sees, however briefly it holds.
   */
  sampling?: SimSampling
  /** Sequencer frame granularity; production default is 10 ms. */
  frameStepMs?: number
  /** Audio only: the starting input level from 0 to 1. */
  level?: number
  /**
   * A cue from the domain's motion library, played beside every lighting cue as a manual motion
   * pick is. The front and back rows are then moving heads, and each sample carries pan and tilt.
   */
  motion?: MotionCueRef
}

interface ResolvedOptions extends Required<Omit<CueSimulatorOptions, 'baseDir' | 'motion'>> {
  baseDir: string
  motion: MotionCueRef | null
}

const DEFAULT_BASE_DIR = path.resolve(__dirname, '../../../resources/defaults')

const SIM_DOMAINS: readonly SimDomain[] = ['yarg', 'rb3', 'audio']

/** The registry a domain's libraries load into. */
function registryFor(domain: SimDomain) {
  return domain === 'audio' ? AudioCueRegistry.getInstance() : getCueRegistry(domain)
}

const BEATS_PER_MEASURE = 4
const EPSILON = 1e-6

/**
 * Headless, deterministic cue simulator. Loads a bundled cue library through the real
 * loader/registry, runs a chosen cue under virtual time while synthesizing YARG, RB3 or audio
 * frames and scenario events, and records the resulting per-light RGBIO over time.
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
  private readonly lightOrder: SimLightOrder

  private driver!: SimDriver
  private groupId = ''
  /** Groups this run registered, per domain, so teardown drops exactly what it loaded. */
  private loadedGroupIdsByDomain: Record<SimDomain, string[]> = { yarg: [], rb3: [], audio: [] }

  private currentCue: string | undefined
  /** The secondary cue playing over the primary, or null for none. */
  private secondaryCue: string | null = null
  /** Audio only: the strobe cue in the strobe slot, or null for none. */
  private strobeCue: string | null = null
  private level: number
  private venue: VenueSize
  private bpm: number
  private vocalActive = false
  private ledBanks: LedBanks = { red: 0, green: 0, blue: 0, yellow: 0 }
  private fogState = false

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
    this.level = opts.level

    const config = buildSimRig(
      opts.frontCount,
      opts.backCount,
      opts.strobeCount,
      opts.motion !== null,
    )
    this.lightManager = new DmxLightManager(config)
    this.lightStateManager = new LightStateManager()
    this.lightTransitionController = new LightTransitionController(this.lightStateManager)
    this.sequencer = new Sequencer(this.lightTransitionController, this.virtualTime)

    this.lightOrder = {
      front: this.lightManager.getLights(['front'], ['all']).map((l) => l.id),
      back: this.lightManager.getLights(['back'], ['all']).map((l) => l.id),
      strobe: this.lightManager.getLights(['strobe'], ['all']).map((l) => l.id),
    }
  }

  public static async create(options: CueSimulatorOptions): Promise<CueSimulator> {
    const resolved: ResolvedOptions = {
      library: options.library,
      domain: options.domain ?? 'yarg',
      baseDir: options.baseDir ?? DEFAULT_BASE_DIR,
      frontCount: options.frontCount ?? 4,
      backCount: options.backCount ?? 4,
      strobeCount: options.strobeCount ?? 0,
      bpm: options.bpm ?? 120,
      venue: options.venue ?? 'Large',
      frameRateHz: options.frameRateHz ?? 30,
      sampleIntervalMs: options.sampleIntervalMs ?? 50,
      sampling: options.sampling ?? 'interval',
      frameStepMs: options.frameStepMs ?? 10,
      level: options.level ?? 0.6,
      motion: options.motion ?? null,
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
    const registry = registryFor(this.opts.domain)
    registry.reset()

    const effectLoader = new EffectLoader({ baseDir: this.opts.baseDir })
    const loader = new NodeCueLoader({
      baseDir: this.opts.baseDir,
      registries: {
        yarg: getCueRegistry('yarg'),
        rb3: getCueRegistry('rb3'),
        audio: AudioCueRegistry.getInstance(),
      },
      effectLoader,
      runtimeBroadcaster: noopRuntimeBroadcaster(),
    })
    await loader.loadAll()

    const allSummaries = loader.getSummary()
    for (const domain of SIM_DOMAINS) {
      this.loadedGroupIdsByDomain[domain] = allSummaries[domain].map((s) => s.groupId)
    }
    const requested = this.opts.library
    const libraryIn = (domain: SimDomain): string | undefined =>
      allSummaries[domain].find(
        (s) => s.groupId === requested || path.basename(s.path, '.json') === requested,
      )?.groupId
    const resolvedGroupId = libraryIn(this.opts.domain)
    if (!resolvedGroupId || !registry.getGroup(resolvedGroupId)) {
      const owner = SIM_DOMAINS.find(
        (domain) => domain !== this.opts.domain && libraryIn(domain) !== undefined,
      )
      const available = allSummaries[this.opts.domain]
        .flatMap((s) => [s.groupId, path.basename(s.path, '.json')])
        .filter((name, index, names) => names.indexOf(name) === index)
        .sort()
      throw new Error(
        owner
          ? `Cue library '${requested}' not found in the ${this.opts.domain} domain. It belongs to the ${owner} domain.`
          : `Cue library '${requested}' not found. Available libraries: ${available.join(', ')}`,
      )
    }
    this.groupId = resolvedGroupId
    this.driver = this.createDriver()
  }

  private createDriver(): SimDriver {
    const { motion } = this.opts
    if (this.opts.domain === 'audio') {
      const registry = AudioCueRegistry.getInstance()
      registry.setEnabledGroups([this.groupId])
      const handler = new AudioCueHandler(
        this.lightManager,
        this.sequencer,
        motion ? { motionCoordinator: createAudioMotionCoordinator(MANUAL_MOTION_TIMING) } : {},
      )
      // With no manual motion cue, audio motion stays off, since its pick is random.
      setManualMotion(handler, registry, motion)
      return new AudioFrameDriver(
        handler,
        () => this.getAudioFrameState(),
        () => this.sequencer.onBeat(),
      )
    }
    const registry = getCueRegistry(this.opts.domain)
    const handler = new CueHandler(this.lightManager, this.sequencer, {
      registry,
      ...(motion ? MANUAL_MOTION_TIMING : {}),
    })
    if (motion) {
      // Motion runs for live frames only, so the frames go as live input sends them, with the
      // registry held to the library under test.
      holdToLibrary(registry, this.groupId)
      setManualMotion(handler, registry, motion)
    }
    return new FrameDriver(
      handler,
      () => this.getFrameState(),
      this.groupId,
      this.opts.domain,
      motion !== null,
    )
  }

  private selectedCue(): string {
    if (this.currentCue === undefined) {
      throw new Error('No cue selected. Call setCue() before running the simulation.')
    }
    return this.currentCue
  }

  private getFrameState(): FrameState {
    return {
      cue: this.resolveCueType(this.secondaryCue ?? this.selectedCue()),
      venue: this.venue,
      bpm: this.bpm,
      vocalActive: this.vocalActive,
      ledBanks: this.ledBanks,
      fogState: this.fogState,
    }
  }

  private getAudioFrameState(): AudioFrameState {
    return {
      cue: this.selectedCue(),
      secondary: this.secondaryCue,
      strobe: this.strobeCue,
      bpm: this.bpm,
      level: this.level,
    }
  }

  /** RB3 only: set the StageKit LED bank masks the running cue mirrors. */
  public setLedBanks(banks: LedBanks): void {
    this.ledBanks = { ...banks }
  }

  /**
   * Select the cue to simulate: a {@link CueType} value the library carries (e.g. `Menu`,
   * `Strobe_Fast`) or one the cue handler acts on itself, or an audio cue id the audio library
   * carries.
   */
  public setCue(cue: string): void {
    if (this.opts.domain === 'audio') {
      this.audioCue(cue)
      this.currentCue = cue
    } else {
      const cueType = this.resolveCueType(cue)
      if (!isHandlerOwnedCueType(cueType)) this.libraryCue(this.opts.domain, cue, cueType)
      this.currentCue = cueType
    }
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
   * applied at their scheduled times, and light states sampled as `sampling` says.
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

    const onPublish = (): void => this.recordSample(this.virtualTime.getCurrentTimeMs())
    const samplePublishes = this.opts.sampling === 'publish'
    if (samplePublishes) {
      this.recordSample(startTime)
      this.lightStateManager.onLightStatesUpdated(onPublish)
    }

    let nextSustain = startTime
    let nextSample = samplePublishes ? Infinity : startTime
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
        await this.driver.dispatch({ beat: isMeasure ? 'Measure' : 'Strong' })
        beatCounter++
        nextBeat += 60000 / this.bpm
      }

      if (nextSustain <= t + EPSILON) {
        await this.driver.dispatch({})
        nextSustain += sustainInterval
      }

      if (nextSample <= t + EPSILON) {
        this.recordSample(t)
        nextSample += this.opts.sampleIntervalMs
      }
    }

    if (samplePublishes) this.lightStateManager.offLightStatesUpdated(onPublish)
    this.recordSample(this.virtualTime.getCurrentTimeMs(), true)

    this.lastTimeline = {
      cue: this.currentCue,
      library: this.groupId,
      venue: this.venue,
      bpm: this.bpm,
      durationMs,
      sampleIntervalMs: this.opts.sampleIntervalMs,
      sampling: this.opts.sampling,
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
      this.driver.shutdown()
      this.sequencer.shutdown()
      // The loader fills every registry, not just the one under test, so tear them all down: a
      // second simulator in the same process finds no per-sequencer state or groups from this run.
      for (const domain of SIM_DOMAINS) {
        const registry = registryFor(domain)
        registry.releaseSequencerFromAllCues(this.sequencer)
        for (const id of this.loadedGroupIdsByDomain[domain]) {
          registry.unregisterGroup(id)
        }
      }
      // Only the domain under test had its registry reset on the way in, so only it is reset here.
      registryFor(this.opts.domain).reset()
      this.lightStateManager.shutdown()
    } finally {
      this.virtualTime.dispose()
    }
  }

  private async applyScenario(entry: ScenarioEntry): Promise<void> {
    if (entry.cue !== undefined) {
      this.driver.stopCues()
      this.setCue(entry.cue)
      this.secondaryCue = null
      this.strobeCue = null
      this.pendingEvents.push(`cue=${entry.cue}`)
    }
    if (entry.secondary !== undefined) {
      this.setSecondary(entry.secondary)
      this.pendingEvents.push(`secondary=${entry.secondary}`)
    }
    if (entry.level !== undefined) {
      this.level = entry.level
      this.pendingEvents.push(`level=${entry.level}`)
    }
    if (entry.bpm !== undefined) {
      this.bpm = entry.bpm
      this.pendingEvents.push(`bpm=${entry.bpm}`)
    }
    if (entry.venue !== undefined) {
      this.venue = entry.venue
      this.pendingEvents.push(`venue=${entry.venue}`)
    }
    if (entry.ledBanks !== undefined) {
      this.ledBanks = { ...entry.ledBanks }
      this.pendingEvents.push(`ledBanks=${JSON.stringify(entry.ledBanks)}`)
    }
    if (entry.fog !== undefined) {
      this.fogState = entry.fog
      this.pendingEvents.push(`fog=${entry.fog}`)
    }
    if (entry.event !== undefined) {
      await this.applyEvent(entry.event)
    }
  }

  /** Put a secondary cue over the running primary, or with an empty name take it away. */
  private setSecondary(name: string): void {
    if (name === '') {
      this.secondaryCue = null
      this.strobeCue = null
    } else if (this.opts.domain === 'audio') {
      if (this.audioCue(name).style === 'strobe') this.strobeCue = name
      else this.secondaryCue = name
    } else {
      const cueType = this.resolveCueType(name)
      if (this.libraryCue(this.opts.domain, name, cueType).style !== CueStyle.Secondary) {
        throw new Error(`'${name}' is not a secondary cue in '${this.groupId}'.`)
      }
      this.secondaryCue = cueType
    }
  }

  private async applyEvent(event: string): Promise<void> {
    if (this.opts.domain === 'audio' && event !== 'beat' && event !== 'measure') {
      throw new Error(`Audio frames carry beats only, so '${event}' does not apply.`)
    }
    this.pendingEvents.push(event)

    if (event === 'vocal-note') {
      this.vocalActive = true
      await this.driver.dispatch({})
      return
    }
    if (event === 'vocal-note-off') {
      this.vocalActive = false
      await this.driver.dispatch({})
      return
    }
    if (event === 'beat') {
      await this.driver.dispatch({ beat: 'Strong' })
      return
    }
    if (event === 'measure') {
      await this.driver.dispatch({ beat: 'Measure' })
      return
    }
    if (event === 'keyframe-first') {
      await this.driver.dispatch({ keyframe: 'First' })
      return
    }
    if (event === 'keyframe-next') {
      await this.driver.dispatch({ keyframe: 'Next' })
      return
    }
    if (event === 'keyframe-previous') {
      await this.driver.dispatch({ keyframe: 'Previous' })
      return
    }

    const transient = CueSimulator.instrumentEventToTransient(event)
    if (transient) {
      await this.driver.dispatch(transient)
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
            ...(state.pan === undefined ? {} : { pan: Number(state.pan.toFixed(1)) }),
            ...(state.tilt === undefined ? {} : { tilt: Number(state.tilt.toFixed(1)) }),
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

  /**
   * The cue from the library under test only. The registry's default-group fallback is skipped,
   * since the simulator runs one library.
   */
  private libraryCue(domain: NetCueMode, name: string, cueType: CueType): INetCue {
    const found = getCueRegistry(domain).getGroup(this.groupId)?.cues.get(cueType)
    if (!found) {
      throw new Error(`Unknown cue '${name}' in '${this.groupId}'.`)
    }
    return found
  }

  /** The audio cue from the library under test only, as {@link libraryCue} is for YARG and RB3. */
  private audioCue(cue: string): IAudioCue {
    const found = AudioCueRegistry.getInstance().getGroup(this.groupId)?.cues.get(cue)
    if (!found) {
      throw new Error(`Unknown audio cue '${cue}' in '${this.groupId}'.`)
    }
    return found
  }

  private resolveCueType(cue: string): CueType {
    const cueType = getCueTypeFromId(cue)
    if (!cueType) {
      throw new Error(`Unknown cue '${cue}'. Expected a CueType value (e.g. Menu, Intro, Default).`)
    }
    return cueType
  }
}
