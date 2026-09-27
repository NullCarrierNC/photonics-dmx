import {
  defaultCueData,
  getCueTypeFromId,
  type CueData,
  type CueType,
  type StrobeState,
} from '../../cues/types/cueTypes'
import { Rb3RightChannel } from '../../listeners/RB3/rb3eTypes'
import { AudioFrameDriver } from '../AudioFrameDriver'
import type { VenueSize } from '../types'
import type { WireClock } from './RealTimeClock'
import type { WireRun } from './WireRun'

/** A steady level, a list of levels cycled frame by frame, or a high level on every Nth frame. */
export type AudioLevel = number | number[] | { every: number; high: number; low: number }

/**
 * YARG frames at `frameMs` carrying `cue`, with beats from `bpm` (every 4th a Measure) and each
 * keyframe on the first frame at or after its time into the step.
 */
interface GameStep {
  type: 'yarg'
  cue: string
  strobe?: StrobeState
  keyframes?: Array<{ atMs: number; keyframe: 'First' | 'Next' | 'Previous' }>
  bpm?: number
  venue?: VenueSize
  frameMs?: number
  durationMs: number
  mark?: string
}

/** Audio analysis frames at `frameMs`, each with a flat spectrum at the step's level. */
interface AudioStep {
  type: 'audio'
  cue: string
  level: AudioLevel
  /** Raises a detected beat at this tempo. Omitted, no beat is detected. */
  bpm?: number
  frameMs?: number
  durationMs: number
  mark?: string
}

/** Time passing with no input. */
interface IdleStep {
  type: 'idle'
  durationMs: number
  mark?: string
}

/** One StageKit command: an LED bank's lit positions (bit 0 is LED 1), a strobe speed, or fog. */
export type StageKitCommand =
  | { atMs: number; bank: 'red' | 'green' | 'blue' | 'yellow'; leds: number }
  | { atMs: number; strobe: 'slow' | 'medium' | 'fast' | 'fastest' | 'off' }
  | { atMs: number; fog: boolean }

/** RB3E StageKit datagrams, each sent at its time into the step, with RB3 cue mode in game. */
interface Rb3Step {
  type: 'rb3'
  stageKit: StageKitCommand[]
  durationMs: number
  mark?: string
}

export type PlayStep = GameStep | AudioStep | IdleStep | Rb3Step

const BANK_CHANNEL = {
  red: Rb3RightChannel.RedLeds,
  green: Rb3RightChannel.GreenLeds,
  blue: Rb3RightChannel.BlueLeds,
  yellow: Rb3RightChannel.YellowLeds,
}

const STROBE_CHANNEL = {
  slow: Rb3RightChannel.StrobeSlow,
  medium: Rb3RightChannel.StrobeMedium,
  fast: Rb3RightChannel.StrobeFast,
  fastest: Rb3RightChannel.StrobeFastest,
  off: Rb3RightChannel.StrobeOff,
}

/** A StageKit command as the datagram's left and right bytes. */
export function stageKitBytes(command: StageKitCommand): [number, number] {
  if ('bank' in command) {
    return [command.leds & 0xff, BANK_CHANNEL[command.bank]]
  }
  if ('strobe' in command) {
    return [0, STROBE_CHANNEL[command.strobe]]
  }
  return [0, command.fog ? Rb3RightChannel.FogOn : Rb3RightChannel.FogOff]
}

const YARG_FRAME_MS = 1000 / 30
const AUDIO_FRAME_MS = 1000 / 60
const BEATS_PER_MEASURE = 4
const EPSILON = 1e-6

/** The level of audio frame `index`. */
export function levelAt(level: AudioLevel, index: number): number {
  if (typeof level === 'number') {
    return level
  }
  if (Array.isArray(level)) {
    return level.length === 0 ? 0 : level[index % level.length]
  }
  return index % Math.max(1, level.every) === 0 ? level.high : level.low
}

function cueTypeOf(cue: string): CueType {
  const cueType = getCueTypeFromId(cue)
  if (!cueType) {
    throw new Error(`Unknown cue '${cue}'. Expected a CueType value (e.g. Menu, Intro, Default).`)
  }
  return cueType
}

function yargFrame(
  step: GameStep,
  cue: CueType,
  beat: CueData['beat'],
  keyframe: CueData['keyframe'],
): CueData {
  return {
    ...defaultCueData,
    datagramVersion: 1,
    platform: 'Windows',
    currentScene: 'Gameplay',
    pauseState: 'Unpaused',
    venueSize: step.venue ?? 'Large',
    beatsPerMinute: step.bpm ?? 120,
    songSection: 'Verse',
    lightingCue: cue,
    strobeState: step.strobe ?? 'Strobe_Off',
    beat,
    keyframe,
    trackMode: 'tracked',
  }
}

/**
 * Plays one step on the run's clock. A frame lands on the first clock step at or after its due
 * time, and beats start on the step's first frame, so each step starts on a downbeat.
 */
export async function playStep(run: WireRun, clock: WireClock, step: PlayStep): Promise<void> {
  const stepMs = clock.getIntervalMs()
  const start = clock.getCurrentTimeMs()
  const elapsed = (): number => clock.getCurrentTimeMs() - start
  if (step.type === 'idle') {
    await clock.advance(step.durationMs)
    return
  }
  if (step.type === 'rb3') {
    const pending = [...step.stageKit].sort((a, b) => a.atMs - b.atMs)
    while (elapsed() < step.durationMs - EPSILON) {
      while (pending.length > 0 && pending[0].atMs <= elapsed() + EPSILON) {
        const command = pending.shift()
        if (command) run.stageKit(...stageKitBytes(command))
      }
      await clock.advance(Math.min(stepMs, step.durationMs - elapsed()))
    }
    return
  }

  const frameMs = step.frameMs ?? (step.type === 'yarg' ? YARG_FRAME_MS : AUDIO_FRAME_MS)
  const bpm = step.type === 'yarg' ? step.bpm ?? 120 : step.bpm ?? 0
  const beatMs = bpm > 0 ? 60000 / bpm : Infinity
  const listener = step.type === 'yarg' ? run.yarg() : null
  const cue = step.type === 'yarg' ? cueTypeOf(step.cue) : null
  const keyframes =
    step.type === 'yarg' ? [...(step.keyframes ?? [])].sort((a, b) => a.atMs - b.atMs) : []
  let frameIndex = 0
  let beatIndex = 0
  let level = 0
  const audio =
    step.type === 'audio'
      ? new AudioFrameDriver(
          run.audio(),
          () => ({ cue: step.cue, secondary: null, strobe: null, bpm, level }),
          () => run.beat(),
        )
      : null

  while (elapsed() < step.durationMs - EPSILON) {
    if (elapsed() + EPSILON >= frameIndex * frameMs) {
      const beatThisFrame = elapsed() + EPSILON >= beatIndex * beatMs
      const beat: CueData['beat'] = !beatThisFrame
        ? 'Off'
        : beatIndex % BEATS_PER_MEASURE === 0
          ? 'Measure'
          : 'Strong'
      if (beatThisFrame) {
        beatIndex++
      }
      if (listener && cue && step.type === 'yarg') {
        const keyframe =
          keyframes.length > 0 && keyframes[0].atMs <= elapsed() + EPSILON
            ? keyframes.shift()?.keyframe ?? 'Off'
            : 'Off'
        listener.processCueData(yargFrame(step, cue, beat, keyframe))
      } else if (audio && step.type === 'audio') {
        level = levelAt(step.level, frameIndex)
        void audio.dispatch(beatThisFrame ? { beat: 'Strong' } : {})
      }
      frameIndex++
    }
    await clock.advance(Math.min(stepMs, step.durationMs - elapsed()))
  }
}
