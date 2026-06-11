import * as fs from 'fs'
import * as path from 'path'
import { CueSimulator, CueSimulatorOptions } from './CueSimulator'
import { ScenarioEntry, SimLightSample, SimTimeline, VenueSize } from './types'

/**
 * CLI front-end for {@link CueSimulator}. Runs a cue headlessly under virtual time and prints
 * a per-light colour timeline plus a transition summary, with optional JSON export.
 *
 * Run via the `sim` npm script, e.g.
 *   npm run sim -- --cue Menu --front 4 --back 4 --duration 3000
 */

interface ParsedArgs {
  flags: Record<string, string>
  bools: Set<string>
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {}
  const bools = new Set<string>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      continue
    }
    const body = arg.slice(2)
    const eq = body.indexOf('=')
    if (eq >= 0) {
      flags[body.slice(0, eq)] = body.slice(eq + 1)
      continue
    }
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      bools.add(body)
    } else {
      flags[body] = next
      i++
    }
  }
  return { flags, bools }
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a number but got '${value}'`)
  }
  return parsed
}

function asVenue(value: string | undefined, fallback: VenueSize): VenueSize {
  if (value === undefined) {
    return fallback
  }
  if (value === 'Large' || value === 'Small' || value === 'NoVenue') {
    return value
  }
  throw new Error(`Invalid venue '${value}'. Expected Large, Small or NoVenue.`)
}

const HELP = `Cue Simulation CLI

Usage: npm run sim -- [options]

Options:
  --library <id>      Cue library group id or filename (default: yarg-stagekit-v2)
  --cue <CueType>     Cue to simulate, e.g. Menu, Intro, Default (required)
  --venue <size>      Large | Small | NoVenue (default: Large)
  --bpm <n>           Beats per minute, 0 disables beats (default: 120)
  --front <n>         Front light count (default: 4)
  --back <n>          Back light count (default: 4)
  --strobe <n>        Strobe light count (default: 0)
  --duration <ms>     Simulated duration (default: 4000)
  --sample <ms>       Sampling interval (default: 50)
  --frame-rate <hz>   Cue re-dispatch rate (default: 30)
  --step <ms>         Sequencer frame granularity (default: 10)
  --scenario <path>   JSON file of scheduled events (see docs/cue-simulation.md)
  --json <path>       Write the full timeline to a JSON file
  --no-color          Disable ANSI colour output
  --help              Show this help
`

/** Foreground brightness threshold to label a light "on" in the transition summary. */
function displayRgb(sample: SimLightSample | null): [number, number, number] {
  if (!sample) {
    return [0, 0, 0]
  }
  const factor = (sample.intensity / 255) * sample.opacity
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)))
  return [clamp(sample.red), clamp(sample.green), clamp(sample.blue)]
}

function block(rgb: [number, number, number], useColor: boolean): string {
  if (!useColor) {
    const [r, g, b] = rgb
    return r + g + b > 24 ? '##' : '..'
  }
  const [r, g, b] = rgb
  return `\x1b[48;2;${r};${g};${b}m  \x1b[0m`
}

function toHex(rgb: [number, number, number]): string {
  return rgb.map((v) => v.toString(16).padStart(2, '0')).join('')
}

function renderTimeline(timeline: SimTimeline, useColor: boolean): string {
  const lines: string[] = []
  const { front, back, strobe } = timeline.lightOrder

  lines.push(
    `Cue '${timeline.cue}' · library '${timeline.library}' · venue ${timeline.venue} · ${timeline.bpm} BPM`,
  )
  lines.push(
    `front=${front.length} back=${back.length} strobe=${strobe.length} · ${timeline.durationMs}ms · sample ${timeline.sampleIntervalMs}ms · ${timeline.samples.length} rows`,
  )
  lines.push('')

  for (const sample of timeline.samples) {
    const renderRow = (ids: string[]) =>
      ids.map((id) => block(displayRgb(sample.lights[id]), useColor)).join('')
    const parts: string[] = [String(sample.timeMs).padStart(6) + 'ms ']
    parts.push(renderRow(front))
    if (back.length > 0) {
      parts.push(' | ' + renderRow(back))
    }
    if (strobe.length > 0) {
      parts.push(' | ' + renderRow(strobe))
    }
    if (sample.events.length > 0) {
      parts.push('  <- ' + sample.events.join(', '))
    }
    lines.push(parts.join(''))
  }

  lines.push('')
  lines.push('Transition summary (colour changes per light):')
  const allIds = [...front, ...back, ...strobe]
  for (const id of allIds) {
    const steps: string[] = []
    let last: string | null = null
    for (const sample of timeline.samples) {
      const hex = toHex(displayRgb(sample.lights[id]))
      if (hex !== last) {
        steps.push(`${sample.timeMs}:#${hex}`)
        last = hex
      }
    }
    lines.push(`  ${id.padEnd(10)} ${steps.join(' ')}`)
  }

  return lines.join('\n')
}

async function main(): Promise<void> {
  const { flags, bools } = parseArgs(process.argv.slice(2))

  if (bools.has('help')) {
    process.stdout.write(HELP)
    return
  }

  const cue = flags.cue
  if (!cue) {
    process.stderr.write('Error: --cue is required.\n\n' + HELP)
    process.exitCode = 1
    return
  }

  const options: CueSimulatorOptions = {
    library: flags.library ?? 'yarg-stagekit-v2',
    frontCount: num(flags.front, 4),
    backCount: num(flags.back, 4),
    strobeCount: num(flags.strobe, 0),
    bpm: num(flags.bpm, 120),
    venue: asVenue(flags.venue, 'Large'),
    frameRateHz: num(flags['frame-rate'], 30),
    sampleIntervalMs: num(flags.sample, 50),
    frameStepMs: num(flags.step, 10),
  }
  const duration = num(flags.duration, 4000)
  const useColor = !bools.has('no-color')

  let scenario: ScenarioEntry[] = []
  if (flags.scenario) {
    const raw = fs.readFileSync(path.resolve(flags.scenario), 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error('Scenario file must contain a JSON array of scenario steps.')
    }
    scenario = parsed as ScenarioEntry[]
  }

  const sim = await CueSimulator.create(options)
  try {
    sim.setCue(cue)
    if (scenario.length > 0) {
      sim.loadScenario(scenario)
    }
    const timeline = await sim.run(duration)
    process.stdout.write(renderTimeline(timeline, useColor) + '\n')

    if (flags.json) {
      const outPath = path.resolve(flags.json)
      fs.writeFileSync(outPath, JSON.stringify(timeline, null, 2), 'utf-8')
      process.stdout.write(`\nTimeline written to ${outPath}\n`)
    }
  } finally {
    sim.dispose()
  }
}

main().catch((error) => {
  process.stderr.write(`Cue simulation failed: ${error instanceof Error ? error.message : error}\n`)
  process.exitCode = 1
})
