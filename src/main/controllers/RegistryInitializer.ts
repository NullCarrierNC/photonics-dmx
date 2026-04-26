import * as path from 'path'
import { app } from 'electron'
import { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import { YargCueRegistry } from '../../photonics-dmx/cues/registries/YargCueRegistry'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import {
  NodeCueLoader,
  NodeCueListSummary,
} from '../../photonics-dmx/cues/node/loader/NodeCueLoader'
import { EffectLoader, EffectListSummary } from '../../photonics-dmx/cues/node/loader/EffectLoader'
import { RENDERER_RECEIVE } from '../../shared/ipcChannels'

export interface RegistryInitializerContext {
  getConfig: () => ConfigurationManager
  sendToAllWindows: (channel: string, ...args: unknown[]) => void
  pushValidationError: (err: { source: 'node-cue' | 'effect'; errors: string[] }) => void
  refreshAudioCueSelection: () => void
  getNodeCueLoader: () => NodeCueLoader | null
  setNodeCueLoader: (loader: NodeCueLoader | null) => void
  getEffectLoader: () => EffectLoader | null
  setEffectLoader: (loader: EffectLoader | null) => void
}

/**
 * One-shot registry and loader setup for YARG, audio, node cues, and effects.
 */
export class RegistryInitializer {
  constructor(private readonly ctx: RegistryInitializerContext) {}

  public async initializeCueRegistry(): Promise<void> {
    const registry = YargCueRegistry.getInstance()
    const config = this.ctx.getConfig()

    const enabledGroupIds = config.getPreference('cueDomains').yarg.enabledGroups ?? []
    if (enabledGroupIds.length > 0) {
      registry.setEnabledGroups(enabledGroupIds)
      console.log('CueRegistry initialized with enabled groups:', enabledGroupIds)
    } else {
      const allGroups = registry.getAllGroups()
      registry.setEnabledGroups(allGroups)
      console.log('CueRegistry initialized with all groups (no preference set):', allGroups)
    }

    const consistencyWindow = config.getPreference('cueConsistencyWindow')
    registry.setCueConsistencyWindow(consistencyWindow)
    console.log('CueRegistry initialized with consistency window:', consistencyWindow, 'ms')

    const selectionMode = config.getCueGroupSelectionMode()
    registry.setCueGroupSelectionMode(selectionMode)
    console.log('CueRegistry initialized with cue group selection mode:', selectionMode)

    const disabledYarg = config.getPreference('cueDomains').yarg.disabledCues
    registry.setDisabledCues(disabledYarg)
  }

  public async initializeAudioCueRegistry(): Promise<void> {
    const registry = AudioCueRegistry.getInstance()
    const config = this.ctx.getConfig()

    const enabledGroupIds = config.getPreference('cueDomains').audio.enabledGroups
    if (enabledGroupIds && enabledGroupIds.length > 0) {
      registry.setEnabledGroups(enabledGroupIds)
      console.log('AudioCueRegistry initialized with enabled groups:', enabledGroupIds)
    } else {
      const allGroups = registry.getRegisteredGroups()
      registry.setEnabledGroups(allGroups)
      if (allGroups.length > 0) {
        void config.updateCueDomain('audio', { enabledGroups: allGroups })
      }
      console.log('AudioCueRegistry initialized with all groups (no preference set):', allGroups)
    }

    const disabledAudio = config.getPreference('cueDomains').audio.disabledCues
    registry.setDisabledCues(disabledAudio)
  }

  public async initializeEffectLoader(): Promise<void> {
    if (this.ctx.getEffectLoader()) {
      return
    }

    const baseDir = path.join(app.getPath('appData'), 'Photonics.rocks')
    const effectLoader = new EffectLoader({ baseDir })
    this.ctx.setEffectLoader(effectLoader)

    const summary = await effectLoader.loadAll()
    console.log(`[EffectLoader] Loaded ${summary.loaded} files with ${summary.failed} failures.`)
    if (summary.failed > 0 && summary.errors.length > 0) {
      summary.errors.forEach((err) => console.error('[EffectLoader]', err))
      this.ctx.pushValidationError({ source: 'effect', errors: summary.errors })
    }
    await effectLoader.startWatching()

    effectLoader.on('changed', async (payload: EffectListSummary) => {
      this.ctx.sendToAllWindows(RENDERER_RECEIVE.EFFECTS_CHANGED, payload)
      const nodeCueLoader = this.ctx.getNodeCueLoader()
      if (nodeCueLoader) {
        try {
          await nodeCueLoader.reload()
        } catch (error) {
          console.error('Failed to reload node cues after effect change:', error)
        }
      }
    })
  }

  public async initializeNodeCueLoader(): Promise<void> {
    if (this.ctx.getNodeCueLoader()) {
      return
    }

    await this.initializeEffectLoader()

    const baseDir = path.join(app.getPath('appData'), 'Photonics.rocks')
    const nodeCueLoader = new NodeCueLoader({
      baseDir,
      yargRegistry: YargCueRegistry.getInstance(),
      audioRegistry: AudioCueRegistry.getInstance(),
      effectLoader: this.ctx.getEffectLoader() ?? undefined,
    })
    this.ctx.setNodeCueLoader(nodeCueLoader)

    const summary = await nodeCueLoader.loadAll()
    console.log(`[NodeCueLoader] Loaded ${summary.loaded} files with ${summary.failed} failures.`)
    if (summary.failed > 0 && summary.errors.length > 0) {
      summary.errors.forEach((err) => console.error('[NodeCueLoader]', err))
      this.ctx.pushValidationError({ source: 'node-cue', errors: summary.errors })
    }
    await nodeCueLoader.startWatching()

    nodeCueLoader.on('changed', (payload: NodeCueListSummary) => {
      this.ctx.sendToAllWindows(RENDERER_RECEIVE.NODE_CUES_CHANGED, payload)
      this.ctx.refreshAudioCueSelection()
    })
  }
}
