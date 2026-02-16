import { performance } from 'perf_hooks';
import { Sequencer } from '../../controllers/sequencer/Sequencer';
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController';
import { LightStateManager } from '../../controllers/sequencer/LightStateManager';
import { DmxLightManager } from '../../controllers/DmxLightManager';
import { createMockDmxLight, createMockLightingConfig } from './testFixtures';
import type { Clock } from '../../controllers/sequencer/Clock';
import type { DmxLight, RGBIO } from '../../types';

class ManualTestClock {
  private callbacks = new Set<(deltaTime: number) => void>();
  private currentTimeMs = 0;
  private tickCount = 0;

  public onTick(callback: (deltaTime: number) => void): void {
    this.callbacks.add(callback);
  }

  public offTick(callback: (deltaTime: number) => void): void {
    this.callbacks.delete(callback);
  }

  public start(): void {
    // no-op
  }

  public stop(): void {
    // no-op
  }

  public isActive(): boolean {
    return true;
  }

  public getCurrentTimeMs(): number {
    return this.currentTimeMs;
  }

  public getAbsoluteTimeMs(): number {
    return this.currentTimeMs;
  }

  public getTickCount(): number {
    return this.tickCount;
  }

  public tick(deltaMs: number): void {
    this.currentTimeMs += deltaMs;
    this.tickCount += 1;
    for (const cb of Array.from(this.callbacks)) {
      cb(deltaMs);
    }
  }
}

export type SequencerHarness = {
  sequencer: Sequencer;
  lightManager: DmxLightManager;
  lightStateManager: LightStateManager;
  frontLightIds: string[];
  backLightIds: string[];
  allLightIds: string[];
  advanceBy: (ms: number) => void;
  getLightState: (lightId: string) => RGBIO | null;
  cleanup: () => void;
};

type SequencerHarnessOptions = {
  frontCount?: number;
  backCount?: number;
  strobeCount?: number;
};

const createLights = (count: number, group: 'front' | 'back' | 'strobe', startIndex: number): DmxLight[] => {
  return Array.from({ length: count }, (_, index) =>
    createMockDmxLight({
      id: `${group}-${startIndex + index + 1}`,
      group,
      position: startIndex + index + 1
    })
  );
};

export const createSequencerHarness = (options: SequencerHarnessOptions = {}): SequencerHarness => {
  const {
    frontCount = 4,
    backCount = 4,
    strobeCount = 0
  } = options;

  const frontLights = createLights(frontCount, 'front', 0);
  const backLights = createLights(backCount, 'back', frontCount);
  const strobeLights = createLights(strobeCount, 'strobe', frontCount + backCount);

  const config = createMockLightingConfig({
    numLights: frontCount + backCount + strobeCount,
    frontLights,
    backLights,
    strobeLights
  });

  const lightManager = new DmxLightManager(config);
  const clock = new ManualTestClock();
  const lightStateManager = new LightStateManager();
  const lightTransitionController = new LightTransitionController(lightStateManager);
  const performanceSpy = jest.spyOn(performance, 'now').mockImplementation(() => clock.getCurrentTimeMs());
  const sequencer = new Sequencer(lightTransitionController, clock as unknown as Clock);

  const frontLightIds = lightManager.getLights(['front'], ['all']).map((light) => light.id);
  const backLightIds = lightManager.getLights(['back'], ['all']).map((light) => light.id);
  const allLightIds = lightManager.getLights(['front', 'back'], ['all']).map((light) => light.id);

  return {
    sequencer,
    lightManager,
    lightStateManager,
    frontLightIds,
    backLightIds,
    allLightIds,
    advanceBy: (ms: number) => clock.tick(ms),
    getLightState: (lightId: string) => lightStateManager.getLightState(lightId),
    cleanup: () => {
      sequencer.shutdown();
      performanceSpy.mockRestore();
    }
  };
};
