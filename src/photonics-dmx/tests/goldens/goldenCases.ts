/**
 * Golden-frame regression for bundled cue libraries.
 *
 * The cue simulator drives the real loader, registry, CueHandler, Sequencer and
 * LightStateManager under a virtual clock, producing a deterministic per-light timeline. We
 * serialize that timeline and diff it against a committed golden, so any drift in a cue's colour,
 * timing or intensity output trips a test rather than slipping out in a release.
 *
 * Regenerate the goldens after an intentional cue change with:
 *   UPDATE_GOLDENS=1 npx jest src/photonics-dmx/tests/sim/cueGoldens.test.ts
 * and review the resulting JSON diff by hand.
 */
import * as fs from 'fs'
import * as path from 'path'
import { CueSimulator } from '../../sim/CueSimulator'
import type { SimTimeline } from '../../sim/types'

export interface GoldenCase {
  library: string
  cue: string
  durationMs: number
}

/**
 * Curated deterministic cues from the default Stage Kit library: static washes, animated chases
 * (Menu, Frenzy, Dischord) and a blackout. Each was verified to produce identical output across
 * repeated runs before being pinned here.
 */
export const GOLDEN_CASES: GoldenCase[] = [
  { library: 'yarg-stagekit', cue: 'Silhouettes', durationMs: 1500 },
  { library: 'yarg-stagekit', cue: 'Intro', durationMs: 1500 },
  { library: 'yarg-stagekit', cue: 'Default', durationMs: 1500 },
  { library: 'yarg-stagekit', cue: 'Menu', durationMs: 1500 },
  { library: 'yarg-stagekit', cue: 'Cool_Automatic', durationMs: 1500 },
  { library: 'yarg-stagekit', cue: 'Warm_Automatic', durationMs: 1500 },
  { library: 'yarg-stagekit', cue: 'Frenzy', durationMs: 1500 },
  { library: 'yarg-stagekit', cue: 'Dischord', durationMs: 1500 },
  { library: 'yarg-stagekit', cue: 'Stomp', durationMs: 1500 },
  { library: 'yarg-stagekit', cue: 'Blackout_Fast', durationMs: 1500 },
]

const GOLDEN_DIR = path.join(__dirname)

const round3 = (n: number): number => Math.round(n * 1000) / 1000

/**
 * A stable, comparable snapshot of a timeline (opacity rounded to kill float noise). This is a
 * plain object, not a string: the test compares parsed structures, so the committed golden can be
 * formatted by prettier however it likes without affecting the comparison.
 */
export type TimelineSnapshot = ReturnType<typeof buildSnapshot>

export function buildSnapshot(timeline: SimTimeline): {
  cue: string
  library: string
  venue: string
  bpm: number
  durationMs: number
  sampleIntervalMs: number
  frameRateHz: number
  lightOrder: SimTimeline['lightOrder']
  samples: Array<{
    timeMs: number
    events: string[]
    lights: Record<string, Record<string, number | string> | null>
  }>
} {
  return {
    cue: timeline.cue,
    library: timeline.library,
    venue: timeline.venue,
    bpm: timeline.bpm,
    durationMs: timeline.durationMs,
    sampleIntervalMs: timeline.sampleIntervalMs,
    frameRateHz: timeline.frameRateHz,
    lightOrder: timeline.lightOrder,
    samples: timeline.samples.map((s) => ({
      timeMs: s.timeMs,
      events: s.events,
      lights: Object.fromEntries(
        Object.entries(s.lights).map(([id, light]) => [
          id,
          light === null
            ? null
            : {
                red: light.red,
                green: light.green,
                blue: light.blue,
                intensity: light.intensity,
                opacity: round3(light.opacity),
                blendMode: light.blendMode,
              },
        ]),
      ),
    })),
  }
}

export async function runGoldenCase(c: GoldenCase): Promise<TimelineSnapshot> {
  const sim = await CueSimulator.create({
    library: c.library,
    frontCount: 4,
    backCount: 4,
    bpm: 0,
    sampleIntervalMs: 50,
  })
  try {
    sim.setCue(c.cue)
    const timeline = await sim.run(c.durationMs)
    return buildSnapshot(timeline)
  } finally {
    sim.dispose()
  }
}

export function goldenPath(c: GoldenCase): string {
  return path.join(GOLDEN_DIR, c.library, `${c.cue}.json`)
}

/** Read and parse a committed golden snapshot, or null if it does not exist yet. */
export function readGolden(c: GoldenCase): TimelineSnapshot | null {
  const p = goldenPath(c)
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as TimelineSnapshot) : null
}

/** Write a golden as plain formatted JSON. Prettier may reformat it on commit; the test parses it. */
export function writeGolden(c: GoldenCase, snapshot: TimelineSnapshot): void {
  const p = goldenPath(c)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')
}
