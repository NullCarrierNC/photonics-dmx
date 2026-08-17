import { CueHandler } from '../../photonics-dmx/cueHandlers/CueHandler'
import { getCueRegistry } from '../../photonics-dmx/cues/registries/cueRegistries'
import type { CueRegistry } from '../../photonics-dmx/cues/registries/CueRegistry'
import type { NetCueMode } from '../../photonics-dmx/cues/types/nodeCueTypes'
import type { MotionCueRef } from '../../photonics-dmx/cues/types/cueTypes'
import {
  noopRuntimeBroadcaster,
  type RuntimeBroadcaster,
} from '../../photonics-dmx/runtime/broadcaster'
import type { CueDomain } from '../../services/configuration/cueDomainTypes'
import type { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'
import type { RigChain } from './RigChain'

/**
 * What separates one game cue domain from the other at the wiring level: which preference domains
 * hold its cue and motion selection, which registry instance resolves its cues, and which renderer
 * channel its motion changes surface on. Everything downstream (handler construction, simulation
 * top-up, motion preference reads) is identical, so it is written once against this row.
 */
export interface CueRuntimeDomain {
  domain: NetCueMode
  /** Preference domain holding this runtime's lighting cue selection. */
  lightingPrefs: CueDomain
  /** Preference domain holding its motion cue selection and motion tunables. */
  motionPrefs: CueDomain
  motionChangeChannel:
    | typeof RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE
    | typeof RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE
  /** Resolved at call time so a test can substitute the instance. */
  registry: () => CueRegistry
}

export const CUE_RUNTIME_DOMAINS: Record<NetCueMode, CueRuntimeDomain> = {
  yarg: {
    domain: 'yarg',
    lightingPrefs: 'yarg',
    motionPrefs: 'yargMotion',
    motionChangeChannel: RENDERER_RECEIVE.YARG_MOTION_CUE_CHANGE,
    registry: () => getCueRegistry('yarg'),
  },
  rb3: {
    domain: 'rb3',
    lightingPrefs: 'rb3',
    motionPrefs: 'rb3Motion',
    motionChangeChannel: RENDERER_RECEIVE.RB3_MOTION_CUE_CHANGE,
    registry: () => getCueRegistry('rb3'),
  },
}

export function cueRuntimeDomain(domain: NetCueMode): CueRuntimeDomain {
  return CUE_RUNTIME_DOMAINS[domain]
}

/** A domain's motion tunables with the defaults applied, so no caller repeats them. */
export interface MotionPrefsSnapshot {
  activeCueRef: MotionCueRef | null
  minimumHoldMs: number
  probabilityPercent: number
  cueDurationMin: number
  cueDurationMax: number
}

export function readMotionPrefs(
  config: ConfigurationManager,
  domain: NetCueMode,
): MotionPrefsSnapshot {
  const prefs = config.getPreference('cueDomains')[cueRuntimeDomain(domain).motionPrefs]
  return {
    activeCueRef: prefs.activeCueRef ?? null,
    minimumHoldMs: prefs.minimumHoldMs ?? 5000,
    probabilityPercent: prefs.probabilityPercent ?? 100,
    cueDurationMin: prefs.cueDurationMin ?? 5,
    cueDurationMax: prefs.cueDurationMax ?? 20,
  }
}

export interface DomainChainHandlerOptions {
  getMotionEnabled: () => boolean
  getMotionCueMinimumHoldMs: () => number
  getMotionCueProbabilityPercent: () => number
  getActiveMotionCueRef: () => MotionCueRef | null
  runtimeBroadcaster: RuntimeBroadcaster
  /**
   * Replace a handler already in the slot. A listener enabling owns the domain and rebuilds; the
   * simulation top-up only fills empty slots so it never discards a running handler.
   */
  replaceExisting: boolean
}

/**
 * Attach one {@link CueHandler} per rig chain in a domain's slot, each bound to that chain's own
 * lights and sequencer so a cue renders against every rig's layout. Only the primary chain's
 * handler gets the real broadcaster, so the UI sees one event per logical cue rather than one per
 * rig. Returns that primary handler.
 */
export function buildDomainChainHandlers(
  domain: NetCueMode,
  chains: RigChain[],
  options: DomainChainHandlerOptions,
): CueHandler | null {
  const row = cueRuntimeDomain(domain)
  for (const chain of chains) {
    const existing = chain.cueHandlers[domain]
    if (existing) {
      if (!options.replaceExisting) continue
      existing.shutdown()
    }
    const handler = new CueHandler(chain.dmxLightManager, chain.sequencer, {
      registry: row.registry(),
      getMotionCueMinimumHoldMs: options.getMotionCueMinimumHoldMs,
      getMotionCueProbabilityPercent: options.getMotionCueProbabilityPercent,
      runtimeBroadcaster: chain.isPrimary ? options.runtimeBroadcaster : noopRuntimeBroadcaster(),
      motionChangeChannel: row.motionChangeChannel,
    })
    handler.setMotionEnabled(options.getMotionEnabled())
    handler.setManualMotionRef(options.getActiveMotionCueRef())
    chain.cueHandlers[domain] = handler
  }
  const primary = chains.find((c) => c.isPrimary) ?? chains[0]
  return primary?.cueHandlers[domain] ?? null
}
