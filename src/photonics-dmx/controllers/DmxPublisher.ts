import {
  RGBIO,
  RgbwDmxChannels,
  RgbDmxChannels,
  RgbStrobeDmxChannels,
  StrobeDmxChannels,
  MovingHeadDmxChannels,
  DmxRig,
  FixtureTypes,
  normalizeFixtureConfig,
} from '../types'
import { DmxLightManager } from './DmxLightManager'
import {
  castToChannelType,
  mirrorDmxForMovingHeadInvert,
  percentToDmx,
} from '../helpers/dmxHelpers'
import { SenderManager } from './SenderManager'
import { LightStateManager } from './sequencer/LightStateManager'
import { createLogger } from '../../shared/logger'
const log = createLogger('DmxPublisher')

/**
 * Prepares DMX data to be sent to individual lights by
 * mapping the provided channel names to the individual
 * fixture's channel numbers and setting their values accordingly.
 * These are then passed to a Sender for actual output.
 */
export class DmxPublisher {
  private _rigManagers: Map<string, { manager: DmxLightManager; rig: DmxRig }> = new Map()
  private _sender: SenderManager
  private _lightStateManager: LightStateManager
  private _immediateBlackoutData: Record<number, number> = {}
  /** Reused each frame to reduce GC */
  private _mergedBuffer: Record<number, number> = {}
  /** When true, `publish` ignores light states; output comes only from `setManualBuffer`. */
  private _manualMode = false

  constructor(senderManager: SenderManager, lightStateManager: LightStateManager) {
    this._sender = senderManager
    this._lightStateManager = lightStateManager

    this.publish = this.publish.bind(this)
    this._lightStateManager.on('LightStatesUpdated', this.publish)

    // Pre-build blackout buffer
    for (let channel = 1; channel <= 512; channel++) {
      this._immediateBlackoutData[channel] = 0
    }
  }

  /**
   * Publishes the provided light states to the DMX senders by
   * mapping the desired channels to each DMX fixture's channels.
   */
  public publish = (lights: Map<string, RGBIO>): void => {
    if (this._manualMode) {
      return
    }
    this.publishNow(lights)
  }

  /**
   * DMX Console: send a raw universe buffer and take over output until {@link clearManualBuffer}.
   */
  public setManualBuffer(buffer: Record<number, number>): void {
    this._manualMode = true
    for (const key of Object.keys(this._mergedBuffer)) {
      delete this._mergedBuffer[Number(key)]
    }
    for (const [k, v] of Object.entries(buffer)) {
      const ch = Number(k)
      if (!Number.isFinite(ch) || ch < 1 || ch > 512) {
        continue
      }
      this._mergedBuffer[ch] = Math.max(0, Math.min(255, Math.round(v)))
    }
    if (Object.keys(this._mergedBuffer).length > 0) {
      try {
        this._sender.send(this._mergedBuffer)
      } catch (error) {
        log.error('Failed to send manual DMX data:', error)
      }
    }
  }

  /**
   * Resume cue-driven output from {@link LightStatesUpdated}.
   */
  public clearManualBuffer(): void {
    this._manualMode = false
    for (const key of Object.keys(this._mergedBuffer)) {
      delete this._mergedBuffer[Number(key)]
    }
  }

  /**
   * Updates the active rigs being published.
   * Only active rigs (where active === true) will be included.
   * @param activeRigs Array of active DMX rigs
   */
  public updateActiveRigs(activeRigs: DmxRig[]): void {
    // Filter to only active rigs
    const rigsToPublish = activeRigs.filter((rig) => rig.active === true)

    // Remove managers for rigs that are no longer active or have been deleted
    const currentRigIds = new Set(rigsToPublish.map((rig) => rig.id))
    for (const [rigId] of this._rigManagers) {
      if (!currentRigIds.has(rigId)) {
        this._rigManagers.delete(rigId)
      }
    }

    // Add or update managers for active rigs
    for (const rig of rigsToPublish) {
      const existing = this._rigManagers.get(rig.id)
      if (existing) {
        // Update existing manager if config changed
        if (existing.rig.config !== rig.config) {
          existing.manager.setConfiguration(rig.config)
          existing.rig = rig
        } else {
          // Just update rig metadata (active, name)
          existing.rig = rig
        }
      } else {
        // Create new manager for this rig
        const manager = new DmxLightManager(rig.config)
        this._rigManagers.set(rig.id, { manager, rig })
      }
    }
  }

  /**
   * Contains the logic for converting light states
   * to DMX channels and sending them.
   * Merges all active rigs into one buffer and sends to all enabled senders.
   * Uses a persistent _mergedBuffer to avoid per-frame allocations.
   */
  private publishNow(lights: Map<string, RGBIO>): void {
    for (const key of Object.keys(this._mergedBuffer)) {
      delete this._mergedBuffer[Number(key)]
    }

    // Sort light IDs for consistent processing order
    const sortedLightIds = Array.from(lights.keys()).sort((a, b) => a.localeCompare(b))

    for (const [_rigId, { manager, rig }] of this._rigManagers) {
      if (!rig.active) {
        continue
      }

      for (const lightId of sortedLightIds) {
        const lightValue = lights.get(lightId)!
        const dmxLight = manager.getDmxLight(lightId)
        if (!dmxLight) {
          continue
        }

        const { red: r, green: g, blue: b, intensity, pan, tilt } = lightValue
        const isMovingHead =
          dmxLight.fixture === FixtureTypes.RGBMH || dmxLight.fixture === FixtureTypes.RGBWMH
        let panOut: number
        let tiltOut: number
        if (isMovingHead) {
          const cfg = normalizeFixtureConfig(dmxLight.config)
          const homePanDmxLogical = percentToDmx(cfg.panHome, cfg.panMin, cfg.panMax)
          const homeTiltDmxLogical = percentToDmx(cfg.tiltHome, cfg.tiltMin, cfg.tiltMax)
          const homePanDmx = cfg.invertPan
            ? mirrorDmxForMovingHeadInvert(homePanDmxLogical, cfg.panMin, cfg.panMax)
            : homePanDmxLogical
          const homeTiltDmx = cfg.invertTilt
            ? mirrorDmxForMovingHeadInvert(homeTiltDmxLogical, cfg.tiltMin, cfg.tiltMax)
            : homeTiltDmxLogical
          if (pan != null) {
            const panDmx = percentToDmx(pan, cfg.panMin, cfg.panMax)
            panOut = cfg.invertPan
              ? mirrorDmxForMovingHeadInvert(panDmx, cfg.panMin, cfg.panMax)
              : panDmx
          } else {
            panOut = homePanDmx
          }
          if (tilt != null) {
            const tiltDmx = percentToDmx(tilt, cfg.tiltMin, cfg.tiltMax)
            tiltOut = cfg.invertTilt
              ? mirrorDmxForMovingHeadInvert(tiltDmx, cfg.tiltMin, cfg.tiltMax)
              : tiltDmx
          } else {
            tiltOut = homeTiltDmx
          }
        } else {
          panOut = pan ?? dmxLight.config?.panHome ?? 0
          tiltOut = tilt ?? dmxLight.config?.tiltHome ?? 0
        }

        const channelsInput: { [key: string]: number } = {
          red: r,
          green: g,
          blue: b,
          masterDimmer: intensity,
          pan: panOut,
          tilt: tiltOut,
        }

        let dmxChannelData
        try {
          dmxChannelData = castToChannelType(dmxLight.fixture, channelsInput)
        } catch (error) {
          log.error(`Error casting channels for Light ID: ${lightId} - ${error}`)
          continue
        }

        for (const [channelName, channelNumber] of Object.entries(dmxLight.channels)) {
          let value: number = 0

          switch (channelName) {
            case 'red':
              value = (dmxChannelData as RgbDmxChannels | RgbStrobeDmxChannels | RgbwDmxChannels)
                .red
              break
            case 'green':
              value = (dmxChannelData as RgbDmxChannels | RgbStrobeDmxChannels | RgbwDmxChannels)
                .green
              break
            case 'blue':
              value = (dmxChannelData as RgbDmxChannels | RgbStrobeDmxChannels | RgbwDmxChannels)
                .blue
              break
            case 'masterDimmer':
              value = (
                dmxChannelData as
                  | RgbDmxChannels
                  | RgbStrobeDmxChannels
                  | RgbwDmxChannels
                  | StrobeDmxChannels
              ).masterDimmer
              break
            case 'pan':
              value = (dmxChannelData as MovingHeadDmxChannels).pan
              break
            case 'tilt':
              value = (dmxChannelData as MovingHeadDmxChannels).tilt
              break
            default:
              continue
          }

          this._mergedBuffer[channelNumber] = Math.max(0, Math.min(255, value))
        }
      }
    }

    if (Object.keys(this._mergedBuffer).length > 0) {
      try {
        this._sender.send(this._mergedBuffer)
      } catch (error) {
        log.error('Failed to send DMX data:', error)
      }
    }
  }

  public async shutdown(): Promise<void> {
    try {
      this.clearManualBuffer()
      // Remove all event listeners
      this._lightStateManager.removeAllListeners()

      // Send a blackout signal to all DMX channels
      if (this._sender) {
        try {
          this._sender.send(this._immediateBlackoutData)
          log.info('DmxPublisher sent final blackout signal')
        } catch (err) {
          log.error('Error sending final blackout signal:', err)
        }
      }

      log.info('DmxPublisher has been successfully shut down.')
    } catch (error) {
      log.error('Error during DmxPublisher shutdown:', error)
      throw error
    }
  }
}
