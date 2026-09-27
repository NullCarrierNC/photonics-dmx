import { CURRENT_RIGS_SCHEMA_VERSION } from '../../photonics-dmx/helpers/lightingConfigMigration'
import type { PlayStep } from '../../photonics-dmx/sim/wire/playStep'
import { isPlainObject } from '../../shared/plainObject'

/** Saves new fixture templates, as My Lights does, and restarts the rig on the result. */
interface SaveTemplatesStep {
  type: 'saveTemplates'
  templates: unknown[]
  mark?: string
}

type ScenarioStep = PlayStep | SaveTemplatesStep

/** A fixture template for {@link RigSpec}. Channels are the template's own numbers. */
interface TemplateSpec {
  id: string
  fixture: string
  channels: Record<string, number>
  label?: string
  config?: Record<string, unknown>
  strobeValues?: Record<string, number>
}

/** A light of {@link RigSpec}, placed at a DMX start address. */
interface LightSpec {
  id: string
  template: string
  /** A `strobe` light sits in the strobe row only, as a dedicated strobe. */
  group: 'front' | 'back' | 'strobe'
  address: number
  /** "Use as strobe" in Lights Layout. */
  strobe?: boolean
}

/** A rig described by its templates and where each light sits, as Lights Layout places them. */
export interface RigSpec {
  templates: TemplateSpec[]
  lights: LightSpec[]
  strobeType?: 'None' | 'Dedicated' | 'AllCapable'
}

/**
 * A rig, an input script and what the wire should show. `files` or `rig` gives the config the
 * app loads, and `expect` is held against the recording by dmx-log's checker.
 */
export interface WireScenario {
  name: string
  description?: string
  /** Config files written to the app-data folder, by name (`lights.json`, `dmxRigs.json`, ...). */
  files?: Record<string, unknown>
  rig?: RigSpec
  yargLibrary?: string
  audioLibrary?: string
  motion?: { groupId: string; cueId: string }
  /** Cue library files laid over a copy of the bundled node data, by path under `node-data`. */
  cueFiles?: Record<string, unknown>
  outputRateHz?: number
  /** The universe the recording is stamped with. The default is 1. */
  universe?: number
  /** Seeds Math.random for the run. The default is the scenario name. */
  seed?: string
  steps: ScenarioStep[]
  /** Channels to watch, as dmx-log's `--channels` takes them. The default is all 512. */
  channels?: string
  /** Where 0 ms sits: `first-change`, `first-packet` or `mark:<name>`. */
  t0?: string
  expect?: { states: unknown[]; universe?: number }
  timeTolMs?: number
  valueTol?: number
  /** For `wire:check --transport`: the packet rate dmx-log must hear, and its time tolerance. */
  wire?: { rateHz?: { min?: number; max?: number }; timeTolMs?: number }
}

const STEP_TYPES = new Set(['yarg', 'audio', 'idle', 'saveTemplates'])

/** The problems that stop `raw` from being run as a scenario, or none. */
export function scenarioProblems(raw: unknown): string[] {
  if (!isPlainObject(raw)) {
    return ['a scenario must be an object']
  }
  const problems: string[] = []
  if (typeof raw.name !== 'string' || raw.name === '') {
    problems.push('name must be a non-empty string')
  }
  if ((raw.files === undefined) === (raw.rig === undefined)) {
    problems.push('give exactly one of files and rig')
  }
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    problems.push('steps must be a non-empty list')
  } else {
    raw.steps.forEach((step: unknown, index) => {
      if (!isPlainObject(step) || typeof step.type !== 'string' || !STEP_TYPES.has(step.type)) {
        problems.push(`steps[${index}].type must be one of ${[...STEP_TYPES].join(', ')}`)
      } else if (step.type !== 'saveTemplates' && !(Number(step.durationMs) > 0)) {
        problems.push(`steps[${index}].durationMs must be above 0`)
      }
    })
  }
  return problems
}

const LAYOUTS = {
  'front': { id: 'front', label: 'Front only' },
  'front-back': { id: 'front-back', label: 'Front and back' },
}

/**
 * The `lights.json` and `dmxRigs.json` bodies for a {@link RigSpec}. Each light's channels sit at
 * its address plus the template channel's offset from the template's master, and an unassigned (0)
 * template channel stays 0. The app re-derives these on load from the master address.
 */
export function rigFiles(spec: RigSpec): Record<string, unknown> {
  const templates = new Map(spec.templates.map((t) => [t.id, t]))
  const placed = spec.lights.map((light, index) => {
    const template = templates.get(light.template)
    if (!template) {
      throw new Error(`Light ${light.id} names template '${light.template}', which is not listed`)
    }
    const master = template.channels.masterDimmer ?? 0
    const channels: Record<string, number> = {}
    for (const [name, channel] of Object.entries(template.channels)) {
      channels[name] = channel === 0 ? 0 : light.address + channel - master
    }
    channels.masterDimmer = light.address
    return {
      id: light.id,
      fixtureId: template.id,
      position: index + 1,
      fixture: template.fixture,
      label: template.label ?? template.id,
      name: template.label ?? template.id,
      isStrobeEnabled: light.strobe === true || light.group === 'strobe',
      group: light.group,
      universe: 1,
      mount: 'floor',
      channels,
      ...(template.config ? { config: template.config } : {}),
      ...(template.strobeValues ? { strobeValues: template.strobeValues } : {}),
    }
  })
  const front = placed.filter((light) => light.group === 'front')
  const back = placed.filter((light) => light.group === 'back')
  return {
    'prefs.json': {},
    'lights.json': {
      lights: spec.templates.map((template, index) => ({
        id: template.id,
        position: index,
        fixture: template.fixture,
        label: template.label ?? template.id,
        name: template.label ?? template.id,
        isStrobeEnabled: false,
        channels: template.channels,
        ...(template.config ? { config: template.config } : {}),
        ...(template.strobeValues ? { strobeValues: template.strobeValues } : {}),
      })),
    },
    'dmxRigs.json': {
      schemaVersion: CURRENT_RIGS_SCHEMA_VERSION,
      rigs: [
        {
          id: 'rig-1',
          name: 'Rig 1',
          active: true,
          config: {
            numLights: placed.length,
            lightLayout: back.length > 0 ? LAYOUTS['front-back'] : LAYOUTS.front,
            strobeType: spec.strobeType ?? 'None',
            frontLights: front,
            backLights: back,
            strobeLights: placed.filter((light) => light.isStrobeEnabled),
          },
        },
      ],
    },
  }
}
