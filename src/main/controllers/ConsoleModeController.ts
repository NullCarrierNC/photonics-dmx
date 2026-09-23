import { ConfigurationManager } from '../../services/configuration/ConfigurationManager'
import {
  LightingConfiguration,
  DmxRig,
  DmxLight,
  FixtureTypes,
  FixtureConfig,
  clampMergeMovingHeadFixtureConfig,
  normalizeFixtureConfig,
} from '../../photonics-dmx/types'
import { createLogger } from '../../shared/logger'

const log = createLogger('ConsoleModeController')

type ListenerChannelSnapshot = { yarg: boolean; rb3: boolean }

type ConsoleListenerSnapshot = { yarg: boolean; rb3: boolean; audio: boolean }

/** The console page's answer when the controllers are between phases and cannot take the wire. */
export const CONSOLE_UNAVAILABLE_MESSAGE =
  'The lighting controllers are restarting or shutting down. Try the console again in a moment.'

export interface ConsoleModeControllerDeps {
  getConfig: () => ConfigurationManager
  ensureInitialized: () => Promise<void>
  getDmxPublisher: () => {
    setManualBuffer: (buffer: Record<number, number>) => void
    clearManualBuffer: () => void
  } | null
  getListenerSnapshot: () => ListenerChannelSnapshot
  getIsAudioEnabled: () => boolean
  /** The three pauses run while console entry holds the lifecycle queue, so they must not queue. */
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

  /**
   * Drive the wire from the console.
   *
   * Gated on console mode being open, because `setManualBuffer` latches the publisher into manual
   * output and only `disableConsoleMode` lifts it, which returns early when it has no console
   * state to restore. Ungated, one stray message from a renderer would freeze cue output for the
   * rest of the session with nothing reporting it.
   */
  public sendConsoleDmx(buffer: Record<number, number>): void {
    if (this.consoleRestore === null) {
      log.warn('Ignoring console DMX: console mode is not open')
      return
    }
    this.deps.getDmxPublisher()?.setManualBuffer(buffer)
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
    if (light.fixture !== FixtureTypes.RGBMH) {
      return { success: false, error: 'Light is not a moving head fixture' }
    }
    if (light.fixtureId !== fixtureId) {
      return { success: false, error: 'Fixture id does not match this light' }
    }
    // Both the rig and its fixture template are checked before either is written, so a refusal
    // leaves neither half changed.
    const userLights = this.deps.getConfig().getUserLights()
    const fi = userLights.findIndex((f) => f.id === fixtureId)
    if (fi < 0) {
      return { success: false, error: 'Fixture template not found in My Lights' }
    }
    const fixture = userLights[fi]
    if (fixture.fixture !== FixtureTypes.RGBMH) {
      return { success: false, error: 'Fixture template is not a moving head' }
    }

    const baseConfig = normalizeFixtureConfig(light.config)
    const newConfig = clampMergeMovingHeadFixtureConfig(baseConfig, patch)
    const updatedLight: DmxLight = { ...light, config: newConfig }
    const newRigConfig = this.replaceLightInRigConfig(rig.config, lightId, updatedLight)
    await this.deps.getConfig().saveDmxRig({ ...rig, config: newRigConfig })

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
