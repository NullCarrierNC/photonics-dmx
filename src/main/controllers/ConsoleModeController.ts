import { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import {
  LightingConfiguration,
  DmxRig,
  DmxLight,
  DmxFixture,
  FixtureTypes,
  FixtureConfig,
  clampMergeMovingHeadFixtureConfig,
  normalizeFixtureConfig,
} from '../../photonics-dmx/types'
import { rawDmxToLogicalHomePercent } from '../../photonics-dmx/helpers/movingHeadCalibration'

type ListenerChannelSnapshot = { yarg: boolean; rb3: boolean }

type ConsoleListenerSnapshot = { yarg: boolean; rb3: boolean; audio: boolean }

export interface ConsoleModeControllerDeps {
  getConfig: () => ConfigurationManager
  ensureInitialized: () => Promise<void>
  getDmxPublisher: () => {
    setManualBuffer: (buffer: Record<number, number>) => void
    clearManualBuffer: () => void
  } | null
  getListenerSnapshot: () => ListenerChannelSnapshot
  getIsAudioEnabled: () => boolean
  pauseYarg: () => Promise<void>
  pauseRb3: () => Promise<void>
  pauseAudio: () => Promise<void>
  refreshActiveRigs: () => void
  restartControllers: () => Promise<void>
}

/**
 * DMX console: pauses network and audio listeners, then drives manual DMX and rig updates.
 * Listeners are not restarted when the console closes; the user re-enables them from the UI.
 */
export class ConsoleModeController {
  private consoleRestore: ConsoleListenerSnapshot | null = null
  private onConsoleEnter: (() => void) | null = null

  constructor(private readonly deps: ConsoleModeControllerDeps) {}

  public setOnConsoleEnter(callback: (() => void) | null): void {
    this.onConsoleEnter = callback
  }

  public getConsoleRestore(): ConsoleListenerSnapshot | null {
    return this.consoleRestore
  }

  public onControllersReinitializedWhileConsoleOpen(): void {
    if (this.consoleRestore !== null) {
      this.deps.getDmxPublisher()?.setManualBuffer({})
    }
  }

  /**
   * DMX Console: pause network and audio listeners and take over DMX output with a manual buffer.
   */
  public async enableConsoleMode(
    rigId: string,
  ): Promise<{ success: true } | { success: false; error: string }> {
    await this.deps.ensureInitialized()
    const rig = this.deps.getConfig().getDmxRig(rigId)
    if (!rig) {
      return { success: false, error: 'Rig not found' }
    }
    this.onConsoleEnter?.()
    if (this.consoleRestore !== null) {
      this.deps.getDmxPublisher()?.setManualBuffer({})
      return { success: true }
    }
    const s = this.deps.getListenerSnapshot()
    this.consoleRestore = { yarg: s.yarg, rb3: s.rb3, audio: this.deps.getIsAudioEnabled() }
    if (this.consoleRestore.yarg) {
      await this.deps.pauseYarg()
    }
    if (this.consoleRestore.rb3) {
      await this.deps.pauseRb3()
    }
    if (this.consoleRestore.audio) {
      await this.deps.pauseAudio()
    }
    this.deps.getDmxPublisher()?.setManualBuffer({})
    return { success: true }
  }

  /**
   * Clear manual console DMX. Paused listeners (YARG, RB3E, audio) stay off until the user turns them back on.
   */
  public async disableConsoleMode(): Promise<
    { success: true } | { success: false; error: string }
  > {
    if (this.consoleRestore === null) {
      return { success: true }
    }
    this.consoleRestore = null
    this.deps.getDmxPublisher()?.clearManualBuffer()
    return { success: true }
  }

  public sendConsoleDmx(buffer: Record<number, number>): void {
    this.deps.getDmxPublisher()?.setManualBuffer(buffer)
  }

  public async updateConsoleChannel(payload: {
    rigId: string
    lightId: string
    fixtureId: string
    channelName: string
    channelNumber: number
  }): Promise<{ success: true } | { success: false; error: string }> {
    const { rigId, lightId, fixtureId, channelName, channelNumber } = payload
    if (!Number.isFinite(channelNumber) || channelNumber < 1 || channelNumber > 512) {
      return { success: false, error: 'Channel number must be between 1 and 512' }
    }
    const rig = this.deps.getConfig().getDmxRig(rigId)
    if (!rig) {
      return { success: false, error: 'Rig not found' }
    }
    const light = this.findLightInRig(rig, lightId)
    if (!light) {
      return { success: false, error: 'Light not found in rig' }
    }
    const channels = light.channels as unknown as Record<string, number>
    if (!Object.prototype.hasOwnProperty.call(channels, channelName)) {
      return { success: false, error: `Unknown channel: ${channelName}` }
    }
    const updatedLight: DmxLight = {
      ...light,
      channels: { ...channels, [channelName]: channelNumber } as unknown as DmxLight['channels'],
    }
    const newConfig = this.replaceLightInRigConfig(rig.config, lightId, updatedLight)
    const updatedRig: DmxRig = { ...rig, config: newConfig }
    await this.deps.getConfig().saveDmxRig(updatedRig)

    const userLights = this.deps.getConfig().getUserLights()
    const fi = userLights.findIndex((f) => f.id === fixtureId)
    if (fi < 0) {
      return { success: false, error: 'Fixture template not found in My Lights' }
    }
    const fixture = userLights[fi]
    const fch = fixture.channels as unknown as Record<string, number>
    if (!Object.prototype.hasOwnProperty.call(fch, channelName)) {
      return { success: false, error: `Channel ${channelName} not on fixture template` }
    }
    const newUserLights = [...userLights]
    newUserLights[fi] = {
      ...fixture,
      channels: { ...fch, [channelName]: channelNumber } as unknown as DmxFixture['channels'],
    }
    await this.deps.getConfig().updateUserLights(newUserLights)

    this.deps.refreshActiveRigs()
    return { success: true }
  }

  public async setConsoleHome(payload: {
    rigId: string
    lightId: string
    fixtureId: string
    panHome: number
    tiltHome: number
  }): Promise<{ success: true } | { success: false; error: string }> {
    const { rigId, lightId, fixtureId, panHome, tiltHome } = payload
    if (!Number.isFinite(panHome) || !Number.isFinite(tiltHome)) {
      return { success: false, error: 'panHome and tiltHome must be finite numbers' }
    }
    const panClamped = Math.max(0, Math.min(255, Math.round(panHome)))
    const tiltClamped = Math.max(0, Math.min(255, Math.round(tiltHome)))
    const rig = this.deps.getConfig().getDmxRig(rigId)
    if (!rig) {
      return { success: false, error: 'Rig not found' }
    }
    const light = this.findLightInRig(rig, lightId)
    if (!light) {
      return { success: false, error: 'Light not found in rig' }
    }
    if (light.fixture !== FixtureTypes.RGBMH && light.fixture !== FixtureTypes.RGBWMH) {
      return { success: false, error: 'Light is not a moving head fixture' }
    }
    const baseConfig: FixtureConfig = normalizeFixtureConfig(light.config)
    const newConfig: FixtureConfig = {
      ...baseConfig,
      panHome: rawDmxToLogicalHomePercent(
        panClamped,
        baseConfig.panMin,
        baseConfig.panMax,
        baseConfig.invertPan,
      ),
      tiltHome: rawDmxToLogicalHomePercent(
        tiltClamped,
        baseConfig.tiltMin,
        baseConfig.tiltMax,
        baseConfig.invertTilt,
      ),
    }
    const updatedLight: DmxLight = { ...light, config: newConfig }
    const newRigConfig = this.replaceLightInRigConfig(rig.config, lightId, updatedLight)
    await this.deps.getConfig().saveDmxRig({ ...rig, config: newRigConfig })

    const userLights = this.deps.getConfig().getUserLights()
    const fi = userLights.findIndex((f) => f.id === fixtureId)
    if (fi < 0) {
      return { success: false, error: 'Fixture template not found in My Lights' }
    }
    const fixture = userLights[fi]
    if (fixture.fixture !== FixtureTypes.RGBMH && fixture.fixture !== FixtureTypes.RGBWMH) {
      return { success: false, error: 'Fixture template is not a moving head' }
    }
    const fBase: FixtureConfig = normalizeFixtureConfig(fixture.config)
    const newUserLights = [...userLights]
    newUserLights[fi] = {
      ...fixture,
      config: {
        ...fBase,
        panHome: rawDmxToLogicalHomePercent(
          panClamped,
          fBase.panMin,
          fBase.panMax,
          fBase.invertPan,
        ),
        tiltHome: rawDmxToLogicalHomePercent(
          tiltClamped,
          fBase.tiltMin,
          fBase.tiltMax,
          fBase.invertTilt,
        ),
      },
    }
    await this.deps.getConfig().updateUserLights(newUserLights)

    this.deps.refreshActiveRigs()
    return { success: true }
  }

  public async setConsoleFixtureConfig(payload: {
    rigId: string
    lightId: string
    fixtureId: string
    config: Partial<FixtureConfig>
  }): Promise<{ success: true } | { success: false; error: string }> {
    const { rigId, lightId, fixtureId, config: patch } = payload
    const rig = this.deps.getConfig().getDmxRig(rigId)
    if (!rig) {
      return { success: false, error: 'Rig not found' }
    }
    const light = this.findLightInRig(rig, lightId)
    if (!light) {
      return { success: false, error: 'Light not found in rig' }
    }
    if (light.fixture !== FixtureTypes.RGBMH && light.fixture !== FixtureTypes.RGBWMH) {
      return { success: false, error: 'Light is not a moving head fixture' }
    }
    if (light.fixtureId !== fixtureId) {
      return { success: false, error: 'Fixture id does not match this light' }
    }
    const baseConfig = normalizeFixtureConfig(light.config)
    const newConfig = clampMergeMovingHeadFixtureConfig(baseConfig, patch)
    const updatedLight: DmxLight = { ...light, config: newConfig }
    const newRigConfig = this.replaceLightInRigConfig(rig.config, lightId, updatedLight)
    await this.deps.getConfig().saveDmxRig({ ...rig, config: newRigConfig })

    const userLights = this.deps.getConfig().getUserLights()
    const fi = userLights.findIndex((f) => f.id === fixtureId)
    if (fi < 0) {
      return { success: false, error: 'Fixture template not found in My Lights' }
    }
    const fixture = userLights[fi]
    if (fixture.fixture !== FixtureTypes.RGBMH && fixture.fixture !== FixtureTypes.RGBWMH) {
      return { success: false, error: 'Fixture template is not a moving head' }
    }
    const fBase = normalizeFixtureConfig(fixture.config)
    const newUserLights = [...userLights]
    newUserLights[fi] = {
      ...fixture,
      config: clampMergeMovingHeadFixtureConfig(fBase, patch),
    }
    await this.deps.getConfig().updateUserLights(newUserLights)

    await this.deps.restartControllers()
    return { success: true }
  }

  private findLightInRig(rig: DmxRig, lightId: string): DmxLight | null {
    const all = [...rig.config.frontLights, ...rig.config.backLights, ...rig.config.strobeLights]
    const found = all.find((l) => l.id === lightId)
    return found ?? null
  }

  private replaceLightInRigConfig(
    config: LightingConfiguration,
    lightId: string,
    replacement: DmxLight,
  ): LightingConfiguration {
    return {
      ...config,
      frontLights: config.frontLights.map((l) => (l.id === lightId ? replacement : l)),
      backLights: config.backLights.map((l) => (l.id === lightId ? replacement : l)),
      strobeLights: config.strobeLights.map((l) => (l.id === lightId ? replacement : l)),
    }
  }
}
