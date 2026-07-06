import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { getRb3CueRegistry } from '../../photonics-dmx/cues/registries/Rb3CueRegistry'
import type { CueDomain } from '../../services/configuration/cueDomainTypes'

/**
 * The registry operations one cue domain needs to reconcile and apply its enabled groups and
 * disabled cues, bound to that domain's registry instance and lighting-vs-motion method set. One
 * source of truth for both the startup reconcile (ControllerManager) and the IPC group handlers,
 * so a new domain is added in exactly one place. Registry lookups stay lazy so this module can be
 * imported before the singletons are constructed.
 */
export interface CueDomainRegistryBinding {
  domain: CueDomain
  getRegisteredIds: () => string[]
  setEnabled: (ids: string[]) => void
  setDisabled: (map: Record<string, string[]>) => void
}

export const CUE_DOMAIN_BINDINGS: readonly CueDomainRegistryBinding[] = [
  {
    domain: 'yarg',
    getRegisteredIds: () => YargCueRegistry.getInstance().getAllGroups(),
    setEnabled: (ids) => YargCueRegistry.getInstance().setEnabledGroups(ids),
    setDisabled: (map) => YargCueRegistry.getInstance().setDisabledCues(map),
  },
  {
    domain: 'audio',
    getRegisteredIds: () => AudioCueRegistry.getInstance().getRegisteredGroups(),
    setEnabled: (ids) => AudioCueRegistry.getInstance().setEnabledGroups(ids),
    setDisabled: (map) => AudioCueRegistry.getInstance().setDisabledCues(map),
  },
  {
    domain: 'yargMotion',
    getRegisteredIds: () => YargCueRegistry.getInstance().getRegisteredMotionGroupIds(),
    setEnabled: (ids) => YargCueRegistry.getInstance().setEnabledMotionGroups(ids),
    setDisabled: (map) => YargCueRegistry.getInstance().setDisabledMotionCues(map),
  },
  {
    domain: 'audioMotion',
    getRegisteredIds: () => AudioCueRegistry.getInstance().getRegisteredMotionGroupIds(),
    setEnabled: (ids) => AudioCueRegistry.getInstance().setEnabledMotionGroups(ids),
    setDisabled: (map) => AudioCueRegistry.getInstance().setDisabledMotionCues(map),
  },
  {
    // RB3 cue mode reuses the YARG registry API against its own registry instance.
    domain: 'rb3',
    getRegisteredIds: () => getRb3CueRegistry().getAllGroups(),
    setEnabled: (ids) => getRb3CueRegistry().setEnabledGroups(ids),
    setDisabled: (map) => getRb3CueRegistry().setDisabledCues(map),
  },
  {
    domain: 'rb3Motion',
    getRegisteredIds: () => getRb3CueRegistry().getRegisteredMotionGroupIds(),
    setEnabled: (ids) => getRb3CueRegistry().setEnabledMotionGroups(ids),
    setDisabled: (map) => getRb3CueRegistry().setDisabledMotionCues(map),
  },
]

/** Lookup one domain's binding, e.g. for the IPC registrar's per-domain spec. */
export function cueDomainBinding(domain: CueDomain): CueDomainRegistryBinding {
  const binding = CUE_DOMAIN_BINDINGS.find((b) => b.domain === domain)
  if (!binding) {
    throw new Error(`No cue-domain registry binding for '${domain}'`)
  }
  return binding
}
