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
import { createLogger } from '../../shared/logger'
import { ipcError, restartAfterSave, type IpcSavedResult } from '../ipc/ipcResult'
import type { LifecyclePhase } from '../../shared/ipcTypes'
import { FAULT_HELD_MESSAGE } from './ControllerLifecycle'

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
  getLifecyclePhase: () => LifecyclePhase
  /** The three pauses run while console entry holds the lifecycle queue, so they must not queue. */
  pauseYarg: () => Promise<void>
  pauseRb3: () => Promise<void>
  pauseAudio: () => Promise<void>
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
    const restore = { yarg: s.yarg, rb3: s.rb3, audio: this.deps.getIsAudioEnabled() }
    this.consoleRestore = restore
    if (restore.yarg) {
      await this.deps.pauseYarg()
    }
    if (restore.rb3) {
      await this.deps.pauseRb3()
    }
    if (restore.audio) {
      await this.deps.pauseAudio()
    }
    // Entry is admitted only while the controllers run, so `failed` here means an uncaught fault
    // arose during it and the fault response has left the console. The entry stays closed, so the
    // wire keeps the fault's blackout.
    if (this.deps.getLifecyclePhase() === 'failed') {
      this.consoleRestore = null
      return { success: false, error: FAULT_HELD_MESSAGE }
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
   * rest of the session with nothing reporting it. Refused too while the controllers are held
   * failed, as the fault response has taken the wire dark.
   */
  public sendConsoleDmx(buffer: Record<number, number>): void {
    if (this.consoleRestore === null) {
      log.warn('Ignoring console DMX: console mode is not open')
      return
    }
    if (this.deps.getLifecyclePhase() === 'failed') {
      log.warn('Ignoring console DMX: the lighting controllers are held failed')
      return
    }
    this.deps.getDmxPublisher()?.setManualBuffer(buffer)
  }

  public async setConsoleFixtureConfig(payload: {
    rigId: string
    lightId: string
    fixtureId: string
    config: Partial<FixtureConfig>
  }): Promise<IpcSavedResult | { success: false; error: string }> {
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
    // leaves neither half changed. A template write that fails puts the rig and template back.
    const fixture = this.deps
      .getConfig()
      .getUserLights()
      .find((f) => f.id === fixtureId)
    if (!fixture) {
      return { success: false, error: 'Fixture template not found in My Lights' }
    }
    if (fixture.fixture !== FixtureTypes.RGBMH) {
      return { success: false, error: 'Fixture template is not a moving head' }
    }

    const baseConfig = normalizeFixtureConfig(light.config)
    const newConfig = clampMergeMovingHeadFixtureConfig(baseConfig, patch)
    const updatedLight: DmxLight = { ...light, config: newConfig }
    const newRigConfig = this.replaceLightInRigConfig(rig.config, lightId, updatedLight)
    const config = this.deps.getConfig()
    await config.saveDmxRig({ ...rig, config: newRigConfig })

    try {
      await config.updateUserLight(fixtureId, (stored) => ({
        ...stored,
        config: clampMergeMovingHeadFixtureConfig(normalizeFixtureConfig(stored.config), patch),
      }))
    } catch (error) {
      const failed = ipcError(error)
      if (await this.restoreFixtureEdit(config, rig, fixtureId, fixture)) {
        return failed
      }
      // Part of the edit stayed on disk, and the running graph has to follow what is there.
      await restartAfterSave(() => this.deps.restartControllers())
      return {
        success: false,
        error: `${failed.error}. The rig change could not be undone and is still saved.`,
      }
    }

    return restartAfterSave(() => this.deps.restartControllers())
  }

  /**
   * Puts the template and then the rig back as they were before an edit, trying the rig whatever
   * the template write does. False when either write fails.
   */
  private async restoreFixtureEdit(
    config: ConfigurationManager,
    rig: DmxRig,
    fixtureId: string,
    fixture: DmxFixture,
  ): Promise<boolean> {
    let restored = true
    try {
      await config.updateUserLight(fixtureId, () => fixture)
    } catch (error) {
      log.error('Could not put the fixture template back after a failed edit:', error)
      restored = false
    }
    try {
      await config.saveDmxRig(rig)
    } catch (error) {
      log.error('Could not put the rig back after a failed fixture edit:', error)
      restored = false
    }
    return restored
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
