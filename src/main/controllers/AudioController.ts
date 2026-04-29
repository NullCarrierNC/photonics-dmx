import { ipcMain } from 'electron'
import { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'
import { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import { AudioCueProcessor } from '../../photonics-dmx/processors/AudioCueProcessor'
import {
  AudioConfig,
  AudioGameModeConfig,
  AudioLightingData,
} from '../../photonics-dmx/listeners/Audio/AudioTypes'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { AudioCueType, AudioMotionCueRef } from '../../photonics-dmx/cues/types/audioCueTypes'
import { RENDERER_RECEIVE, RENDERER_SEND } from '../../shared/ipcChannels'
import { createLogger } from '../../shared/logger'
const log = createLogger('AudioController')

export interface AudioControllerDeps {
  getDmxLightManager: () => DmxLightManager | null
  getEffectsController: () => ILightingController | null
  config: ConfigurationManager
  sendToAllWindows: (channel: string, ...args: unknown[]) => void
}

type AudioDataHandler = (event: unknown, data: unknown) => void

export class AudioController {
  private audioProcessor: AudioCueProcessor | null = null
  private isAudioEnabled = false
  private audioDataHandler: AudioDataHandler | null = null
  private broadcastAudioMirror: ((data: AudioLightingData) => void) | null = null

  constructor(private readonly deps: AudioControllerDeps) {}

  public setBroadcastAudioMirror(fn: ((data: AudioLightingData) => void) | null): void {
    this.broadcastAudioMirror = fn
  }

  public async enableAudio(isInitialized: boolean, initAsync: () => Promise<void>): Promise<void> {
    if (!isInitialized) {
      log.info('Initializing system before enabling Audio')
      await initAsync()
    }
    await this.enableAudioInternal()
  }

  public async enableAudioInternal(): Promise<void> {
    const dmxLightManager = this.deps.getDmxLightManager()
    const effectsController = this.deps.getEffectsController()
    if (this.isAudioEnabled || !effectsController || !dmxLightManager) {
      log.info('Cannot enable Audio: already enabled or missing required components')
      return
    }
    const audioConfig = this.deps.config.getAudioConfig()
    try {
      log.info('Enabling audio with Web Audio API...')
      const preferredCueType = this.deps.config.getPreference('activeAudioCueType')
      this.audioProcessor = new AudioCueProcessor(
        dmxLightManager,
        effectsController,
        audioConfig,
        preferredCueType,
        null,
        () => this.deps.config.getPreference('cueDomains').yargMotion.minimumHoldMs ?? 5000,
        () => this.deps.config.getPreference('cueDomains').audioMotion.probabilityPercent ?? 100,
      )
      this.audioProcessor.setOnStrobeStateChange((active) => {
        const strobeCueType = this.audioProcessor?.getEffectiveStrobeCueType() ?? null
        this.deps.sendToAllWindows(RENDERER_RECEIVE.AUDIO_STROBE_STATE, {
          active,
          strobeCueType,
        })
      })
      this.audioProcessor.setOnGameModeCueChange((activeCueType) => {
        this.deps.sendToAllWindows(RENDERER_RECEIVE.AUDIO_GAME_MODE_CUE_CHANGE, {
          activeCueType,
        })
      })
      this.audioProcessor.setMotionEnabled(this.deps.config.getPreference('motionEnabled') ?? true)
      this.audioProcessor.setManualMotionRef(
        this.deps.config.getPreference('cueDomains').audioMotion.activeCueRef ?? null,
      )
      this.audioProcessor.start()
      const gameMode = this.deps.config.getAudioGameModeConfig()
      if (gameMode.enabled) {
        this.audioProcessor.enableGameMode(gameMode)
      } else {
        await this.deps.config.setPreference(
          'activeAudioCueType',
          this.audioProcessor.getManualPrimaryCueType(),
        )
      }
      if (this.audioDataHandler) {
        ipcMain.removeListener(RENDERER_SEND.AUDIO_DATA, this.audioDataHandler)
        this.audioDataHandler = null
      }
      this.audioDataHandler = (_: unknown, data: unknown) => {
        const lightingData = data as AudioLightingData
        if (this.audioProcessor && this.isAudioEnabled) {
          this.audioProcessor.processAudioData(lightingData)
        }
        this.broadcastAudioMirror?.(lightingData)
      }
      ipcMain.on(RENDERER_SEND.AUDIO_DATA, this.audioDataHandler)
      this.deps.sendToAllWindows(RENDERER_RECEIVE.AUDIO_ENABLE, audioConfig)
      log.info('Sent audio:enable to renderer')
      this.isAudioEnabled = true
      log.info('Audio enabled successfully')
    } catch (error) {
      log.error('Failed to enable audio:', error)
      throw error
    }
  }

  public async disableAudio(): Promise<void> {
    if (!this.isAudioEnabled) {
      return
    }
    log.info('Disabling audio...')
    const effectsController = this.deps.getEffectsController()
    if (effectsController) {
      try {
        effectsController.removeAllEffects()
        await effectsController.blackout(0)
        log.info(
          'AudioController: Cleared all running effects and initiated blackout when disabling Audio',
        )
      } catch (error) {
        log.error('Error clearing effects when disabling Audio:', error)
      }
    }
    this.deps.sendToAllWindows(RENDERER_RECEIVE.AUDIO_DISABLE, undefined)
    log.info('Sent audio:disable to renderer')
    if (this.audioDataHandler) {
      ipcMain.removeListener(RENDERER_SEND.AUDIO_DATA, this.audioDataHandler)
      this.audioDataHandler = null
    }
    if (this.audioProcessor) {
      this.audioProcessor.setOnStrobeStateChange(null)
      this.audioProcessor.setOnGameModeCueChange(null)
      this.audioProcessor.shutdown()
      this.audioProcessor = null
    }
    this.isAudioEnabled = false
    log.info('Audio disabled successfully')
  }

  public updateAudioConfig(config: AudioConfig): void {
    if (!this.isAudioEnabled || !this.audioProcessor) {
      return
    }
    const currentConfig = this.deps.config.getAudioConfig()
    const mergedConfig = { ...currentConfig, ...config }
    this.deps.config.setAudioConfig(mergedConfig)
    this.audioProcessor.updateConfig(mergedConfig)
    log.info('AudioCueProcessor configuration updated')
  }

  public refreshAudioCueSelection(): void {
    if (this.audioProcessor) {
      this.audioProcessor.refreshCueSelection()
      if (!this.deps.config.getAudioGameModeConfig().enabled) {
        void this.deps.config.setPreference(
          'activeAudioCueType',
          this.audioProcessor.getManualPrimaryCueType(),
        )
      }
    }
  }

  public getAudioGameModeConfig(): AudioGameModeConfig {
    return this.deps.config.getAudioGameModeConfig()
  }

  public async setAudioGameModeConfig(config: AudioGameModeConfig): Promise<void> {
    await this.deps.config.setAudioGameModeConfig(config)
    if (!this.audioProcessor || !this.isAudioEnabled) {
      return
    }
    if (config.enabled) {
      if (this.audioProcessor.isGameModeEnabled()) {
        this.audioProcessor.updateGameModeConfig(config)
      } else {
        this.audioProcessor.enableGameMode(config)
      }
    } else if (this.audioProcessor.isGameModeEnabled()) {
      this.audioProcessor.disableGameMode()
    }
  }

  public getActiveSecondaryCueType(): AudioCueType | null {
    if (this.audioProcessor) {
      return this.audioProcessor.getEffectiveSecondaryCueType()
    }
    return null
  }

  public getActiveStrobeCueType(): AudioCueType | null {
    if (this.audioProcessor) {
      return this.audioProcessor.getEffectiveStrobeCueType()
    }
    return null
  }

  public getActiveAudioCueType(): AudioCueType {
    if (this.audioProcessor) {
      return this.audioProcessor.getCurrentCueType()
    }
    const saved = this.deps.config.getPreference('activeAudioCueType')
    if (saved) {
      return saved
    }
    const registry = AudioCueRegistry.getInstance()
    const enabled = registry.getAvailableCueTypes()
    if (enabled.length > 0) {
      return enabled[0]
    }
    const fallback = registry.getAvailableCueTypes(true)
    if (fallback.length > 0) {
      return fallback[0]
    }
    return ''
  }

  public setActiveAudioCueType(cueType: AudioCueType): { success: boolean; error?: string } {
    const registry = AudioCueRegistry.getInstance()
    const available = registry.getAvailableCueTypes()
    if (!available.includes(cueType)) {
      return {
        success: false,
        error: `Cue ${cueType} is not available in enabled groups`,
      }
    }
    void this.deps.config.setPreference('activeAudioCueType', cueType).catch((err) => {
      log.error('Failed to persist active audio cue type:', err)
    })
    if (this.audioProcessor) {
      const applied = this.audioProcessor.setActiveCueType(cueType)
      if (!applied) {
        return {
          success: false,
          error: `Cue ${cueType} could not be activated`,
        }
      }
    }
    return { success: true }
  }

  public getAudioCueOptions(): Array<{
    id: AudioCueType
    label: string
    description: string
    groupId: string
    groupName: string
    groupDescription: string
  }> {
    const registry = AudioCueRegistry.getInstance()
    const enabledGroupIds = registry.getEnabledGroups()
    const targetGroups =
      enabledGroupIds.length > 0 ? enabledGroupIds : registry.getRegisteredGroups()
    const cueMap = new Map<
      AudioCueType,
      {
        id: AudioCueType
        label: string
        description: string
        groupId: string
        groupName: string
        groupDescription: string
      }
    >()
    for (const groupId of targetGroups) {
      const group = registry.getGroup(groupId)
      if (!group) continue
      group.cues.forEach((cue) => {
        if (registry.isCueDisabled(groupId, cue.cueType)) {
          return
        }
        cueMap.set(cue.cueType, {
          id: cue.cueType,
          label: cue.name,
          description: cue.description,
          groupId: group.id,
          groupName: group.name,
          groupDescription: group.description,
        })
      })
    }
    return Array.from(cueMap.values())
  }

  public getIsAudioEnabled(): boolean {
    return this.isAudioEnabled
  }

  public isAudioGameModeActive(): boolean {
    return this.audioProcessor?.isGameModeEnabled() ?? false
  }

  public setMotionEnabled(enabled: boolean): void {
    this.audioProcessor?.setMotionEnabled(enabled)
  }

  public setActiveAudioMotionCueRef(ref: AudioMotionCueRef | null): void {
    this.audioProcessor?.setManualMotionRef(ref)
  }
}
