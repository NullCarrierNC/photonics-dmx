import { ipcMain } from 'electron'
import { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import { DmxLightManager } from '../../photonics-dmx/controllers/DmxLightManager'
import { ILightingController } from '../../photonics-dmx/controllers/sequencer/interfaces'
import { AudioCueProcessor } from '../../photonics-dmx/processors/AudioCueProcessor'
import { AudioConfig, AudioLightingData } from '../../photonics-dmx/listeners/Audio/AudioTypes'
import { AudioCueRegistry } from '../../photonics-dmx/cues/registries/AudioCueRegistry'
import { AudioCueType, BuiltInAudioCues } from '../../photonics-dmx/cues/types/audioCueTypes'
import { RENDERER_RECEIVE, RENDERER_SEND } from '../../shared/ipcChannels'

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

  constructor(private readonly deps: AudioControllerDeps) {}

  public async enableAudio(isInitialized: boolean, initAsync: () => Promise<void>): Promise<void> {
    if (!isInitialized) {
      console.log('Initializing system before enabling Audio')
      await initAsync()
    }
    await this.enableAudioInternal()
  }

  public async enableAudioInternal(): Promise<void> {
    const dmxLightManager = this.deps.getDmxLightManager()
    const effectsController = this.deps.getEffectsController()
    if (this.isAudioEnabled || !effectsController || !dmxLightManager) {
      console.log('Cannot enable Audio: already enabled or missing required components')
      return
    }
    const audioConfig = this.deps.config.getAudioConfig()
    try {
      console.log('Enabling audio with Web Audio API...')
      const preferredCueType = this.deps.config.getActiveAudioCueType()
      this.audioProcessor = new AudioCueProcessor(
        dmxLightManager,
        effectsController,
        audioConfig,
        preferredCueType,
      )
      this.deps.config.setActiveAudioCueType(this.audioProcessor.getCurrentCueType())
      this.audioProcessor.start()
      if (this.audioDataHandler) {
        ipcMain.removeListener(RENDERER_SEND.AUDIO_DATA, this.audioDataHandler)
        this.audioDataHandler = null
      }
      this.audioDataHandler = (_: unknown, data: unknown) => {
        if (this.audioProcessor && this.isAudioEnabled) {
          this.audioProcessor.processAudioData(data as AudioLightingData)
        }
      }
      ipcMain.on(RENDERER_SEND.AUDIO_DATA, this.audioDataHandler)
      this.deps.sendToAllWindows(RENDERER_RECEIVE.AUDIO_ENABLE, audioConfig)
      console.log('Sent audio:enable to renderer')
      this.isAudioEnabled = true
      console.log('Audio enabled successfully')
    } catch (error) {
      console.error('Failed to enable audio:', error)
      throw error
    }
  }

  public async disableAudio(): Promise<void> {
    if (!this.isAudioEnabled) {
      return
    }
    console.log('Disabling audio...')
    const effectsController = this.deps.getEffectsController()
    if (effectsController) {
      try {
        effectsController.removeAllEffects()
        await effectsController.blackout(0)
        console.log(
          'AudioController: Cleared all running effects and initiated blackout when disabling Audio',
        )
      } catch (error) {
        console.error('Error clearing effects when disabling Audio:', error)
      }
    }
    this.deps.sendToAllWindows(RENDERER_RECEIVE.AUDIO_DISABLE, undefined)
    console.log('Sent audio:disable to renderer')
    if (this.audioDataHandler) {
      ipcMain.removeListener(RENDERER_SEND.AUDIO_DATA, this.audioDataHandler)
      this.audioDataHandler = null
    }
    if (this.audioProcessor) {
      this.audioProcessor.shutdown()
      this.audioProcessor = null
    }
    this.isAudioEnabled = false
    console.log('Audio disabled successfully')
  }

  public updateAudioConfig(config: AudioConfig): void {
    if (!this.isAudioEnabled || !this.audioProcessor) {
      return
    }
    const currentConfig = this.deps.config.getAudioConfig()
    const mergedConfig = { ...currentConfig, ...config }
    this.deps.config.setAudioConfig(mergedConfig)
    this.audioProcessor.updateConfig(mergedConfig)
    console.log('AudioCueProcessor configuration updated')
  }

  public refreshAudioCueSelection(): void {
    if (this.audioProcessor) {
      this.audioProcessor.refreshCueSelection()
      this.deps.config.setActiveAudioCueType(this.audioProcessor.getCurrentCueType())
    }
  }

  public getActiveAudioCueType(): AudioCueType {
    if (this.audioProcessor) {
      return this.audioProcessor.getCurrentCueType()
    }
    const saved = this.deps.config.getActiveAudioCueType()
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
    return BuiltInAudioCues.BasicLayered
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
    this.deps.config.setActiveAudioCueType(cueType)
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
        cueMap.set(cue.cueType, {
          id: cue.cueType,
          label: cue.id,
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
}
