import { CueRegistry } from '../../photonics-dmx/cues/registries/CueRegistry'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { getCueRegistry } from '../../photonics-dmx/cues/registries/cueRegistries'
import type { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import type { CueDomain, CueDomainPrefs } from '../../services/configuration/cueDomainTypes'
import { reconcileEnabledGroups, sameIds, type ReconciledCueGroups } from './cueGroupReconcile'
import { createLogger } from '../../shared/logger'

const log = createLogger('cueDomainBindings')

/** A domain's stored group selection, however that domain happens to persist it. */
export interface StoredCueGroups {
  enabledGroups?: string[]
  knownGroups?: string[]
  disabledCues: Record<string, string[]>
}

/**
 * Everything one cue domain needs to reconcile, apply and persist its enabled groups and disabled
 * cues, bound to that domain's registry instance and lighting-vs-motion method set. One source of
 * truth for the startup reconcile (ControllerManager), the IPC group handlers, and the save-time
 * opt-in, so a new domain is added in exactly one place. Registry lookups and preference access
 * stay lazy closures so this module can be imported before the singletons are constructed, and so a
 * domain whose preferences live outside `cueDomains` can supply its own storage.
 */
export interface CueDomainRegistryBinding {
  domain: CueDomain
  getRegisteredIds: () => string[]
  setEnabled: (ids: string[]) => void
  setDisabled: (map: Record<string, string[]>) => void
  readStored: (config: ConfigurationManager) => StoredCueGroups
  persist: (config: ConfigurationManager, patch: Partial<CueDomainPrefs>) => Promise<void>
  /**
   * Registry-wide settings applied once at startup, before the node cue loader registers any
   * groups. Enabled and disabled state is not lasting here (it would apply to an empty registry);
   * {@link reconcileAndApplyGroups} settles that once the groups exist.
   */
  applyStartupSettings?: (config: ConfigurationManager) => Promise<void> | void
}

/** Default storage: the domain's own slot under the `cueDomains` preference. */
function cueDomainStorage(
  domain: CueDomain,
): Pick<CueDomainRegistryBinding, 'readStored' | 'persist'> {
  return {
    readStored: (config) => {
      const prefs = config.getPreference('cueDomains')[domain]
      return {
        enabledGroups: prefs.enabledGroups,
        knownGroups: prefs.knownGroups,
        disabledCues: prefs.disabledCues,
      }
    },
    persist: (config, patch) => config.updateCueDomain(domain, patch),
  }
}

/** Narrow a stored motion selection mode to the union the motion registries accept. */
function motionSelectionMode(
  stored: CueDomainPrefs['selectionMode'],
  fallback: 'perCueChange' | 'oncePerSong' | 'none',
): 'perCueChange' | 'oncePerSong' | 'none' {
  return stored === 'oncePerSong' || stored === 'none' || stored === 'perCueChange'
    ? stored
    : fallback
}

const bindings: CueDomainRegistryBinding[] = [
  {
    domain: 'yarg',
    getRegisteredIds: () => CueRegistry.getInstance().getAllGroups(),
    setEnabled: (ids) => CueRegistry.getInstance().setEnabledGroups(ids),
    setDisabled: (map) => CueRegistry.getInstance().setDisabledCues(map),
    ...cueDomainStorage('yarg'),
    applyStartupSettings: (config) => {
      const registry = CueRegistry.getInstance()
      const enabledGroupIds = config.getPreference('cueDomains').yarg.enabledGroups ?? []
      if (enabledGroupIds.length > 0) {
        registry.setEnabledGroups(enabledGroupIds)
        log.info('CueRegistry initialized with enabled groups:', enabledGroupIds)
      } else {
        const allGroups = registry.getAllGroups()
        registry.setEnabledGroups(allGroups)
        log.info('CueRegistry initialized with all groups (no preference set):', allGroups)
      }
      const consistencyWindow = config.getPreference('cueConsistencyWindow')
      registry.setCueConsistencyWindow(consistencyWindow)
      registry.setCueGroupSelectionMode(config.getCueGroupSelectionMode())
      registry.setDisabledCues(config.getPreference('cueDomains').yarg.disabledCues)
    },
  },
  {
    domain: 'yargMotion',
    getRegisteredIds: () => CueRegistry.getInstance().getRegisteredMotionGroupIds(),
    setEnabled: (ids) => CueRegistry.getInstance().setEnabledMotionGroups(ids),
    setDisabled: (map) => CueRegistry.getInstance().setDisabledMotionCues(map),
    ...cueDomainStorage('yargMotion'),
    applyStartupSettings: (config) => {
      const registry = CueRegistry.getInstance()
      registry.setMotionSelectionMode(config.getMotionGroupSelectionMode())
      registry.setDisabledMotionCues(config.getPreference('cueDomains').yargMotion.disabledCues)
    },
  },
  {
    domain: 'audio',
    getRegisteredIds: () => AudioCueRegistry.getInstance().getRegisteredGroups(),
    setEnabled: (ids) => AudioCueRegistry.getInstance().setEnabledGroups(ids),
    setDisabled: (map) => AudioCueRegistry.getInstance().setDisabledCues(map),
    ...cueDomainStorage('audio'),
    applyStartupSettings: (config) => {
      const registry = AudioCueRegistry.getInstance()
      const enabledGroupIds = config.getPreference('cueDomains').audio.enabledGroups
      if (enabledGroupIds && enabledGroupIds.length > 0) {
        registry.setEnabledGroups(enabledGroupIds)
        log.info('AudioCueRegistry initialized with enabled groups:', enabledGroupIds)
      } else {
        const allGroups = registry.getRegisteredGroups()
        registry.setEnabledGroups(allGroups)
        if (allGroups.length > 0) {
          void config
            .updateCueDomain('audio', { enabledGroups: allGroups })
            .catch((err) => log.error('Failed to persist default audio enabled groups:', err))
        }
        log.info('AudioCueRegistry initialized with all groups (no preference set):', allGroups)
      }
      registry.setDisabledCues(config.getPreference('cueDomains').audio.disabledCues)
    },
  },
  {
    domain: 'audioMotion',
    getRegisteredIds: () => AudioCueRegistry.getInstance().getRegisteredMotionGroupIds(),
    setEnabled: (ids) => AudioCueRegistry.getInstance().setEnabledMotionGroups(ids),
    setDisabled: (map) => AudioCueRegistry.getInstance().setDisabledMotionCues(map),
    ...cueDomainStorage('audioMotion'),
    applyStartupSettings: (config) => {
      const registry = AudioCueRegistry.getInstance()
      registry.setMotionSelectionMode(config.getAudioMotionGroupSelectionMode())
      registry.setDisabledMotionCues(config.getPreference('cueDomains').audioMotion.disabledCues)
    },
  },
  {
    // RB3 cue mode reuses the YARG registry API against its own registry instance.
    domain: 'rb3',
    getRegisteredIds: () => getCueRegistry('rb3').getAllGroups(),
    setEnabled: (ids) => getCueRegistry('rb3').setEnabledGroups(ids),
    setDisabled: (map) => getCueRegistry('rb3').setDisabledCues(map),
    ...cueDomainStorage('rb3'),
    applyStartupSettings: (config) => {
      const registry = getCueRegistry('rb3')
      registry.setCueConsistencyWindow(config.getPreference('cueConsistencyWindow'))
      registry.setCueGroupSelectionMode(
        config.getPreference('cueDomains').rb3.selectionMode === 'oncePerSong'
          ? 'oncePerSong'
          : 'withinSong',
      )
    },
  },
  {
    domain: 'rb3Motion',
    getRegisteredIds: () => getCueRegistry('rb3').getRegisteredMotionGroupIds(),
    setEnabled: (ids) => getCueRegistry('rb3').setEnabledMotionGroups(ids),
    setDisabled: (map) => getCueRegistry('rb3').setDisabledMotionCues(map),
    ...cueDomainStorage('rb3Motion'),
    applyStartupSettings: (config) => {
      const registry = getCueRegistry('rb3')
      registry.setMotionSelectionMode(
        motionSelectionMode(
          config.getPreference('cueDomains').rb3Motion.selectionMode,
          'perCueChange',
        ),
      )
      registry.setDisabledMotionCues(config.getPreference('cueDomains').rb3Motion.disabledCues)
    },
  },
]

export const CUE_DOMAIN_BINDINGS: readonly CueDomainRegistryBinding[] = bindings

/** Add a domain that lives outside this module, e.g. one contributed by an optional feature. */
export function registerCueDomainBinding(binding: CueDomainRegistryBinding): void {
  const existing = bindings.findIndex((b) => b.domain === binding.domain)
  if (existing >= 0) {
    bindings[existing] = binding
    return
  }
  bindings.push(binding)
}

/** Lookup one domain's binding, e.g. for the IPC registrar's per-domain spec. */
export function cueDomainBinding(domain: CueDomain): CueDomainRegistryBinding {
  const binding = bindings.find((b) => b.domain === domain)
  if (!binding) {
    throw new Error(`No cue-domain registry binding for '${domain}'`)
  }
  return binding
}

/**
 * Reconcile a domain's stored group selection against its registry, persist the result as one write
 * (skipped when it already matches), and apply enabled plus disabled state. `seedEnabled` opts extra
 * ids in before reconciling, which is how saving a cue file enables its group.
 */
export async function reconcileAndApplyGroups(
  binding: CueDomainRegistryBinding,
  config: ConfigurationManager,
  seedEnabled: readonly string[] = [],
): Promise<ReconciledCueGroups> {
  const stored = binding.readStored(config)
  const reconciled = reconcileEnabledGroups(
    [...(stored.enabledGroups ?? []), ...seedEnabled],
    stored.knownGroups,
    binding.getRegisteredIds(),
  )
  const unchanged =
    sameIds(reconciled.enabled, stored.enabledGroups ?? []) &&
    sameIds(reconciled.known, stored.knownGroups ?? [])
  if (!unchanged) {
    await binding.persist(config, {
      enabledGroups: reconciled.enabled,
      knownGroups: reconciled.known,
    })
  }
  binding.setEnabled(reconciled.enabled)
  binding.setDisabled(binding.readStored(config).disabledCues)
  return reconciled
}
