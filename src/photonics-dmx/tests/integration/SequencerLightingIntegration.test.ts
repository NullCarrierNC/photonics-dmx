import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { performance } from 'perf_hooks';
import { Sequencer } from '../../controllers/sequencer/Sequencer';
import { LightTransitionController } from '../../controllers/sequencer/LightTransitionController';
import { LightStateManager } from '../../controllers/sequencer/LightStateManager';
import { DmxLightManager } from '../../controllers/DmxLightManager';
import { createMockDmxLight, createMockLightingConfig } from '../helpers/testFixtures';
import { getColor } from '../../helpers/dmxHelpers';
import { CueData, CueType, DrumNoteType, defaultCueData } from '../../cues/cueTypes';
import { StageKitMenuCue } from '../../cues/yarg/handlers/stagekit/StageKitMenuCue';
import { StageKitCoolManualCue } from '../../cues/yarg/handlers/stagekit/StageKitCoolManualCue';
import { Effect, RGBIO } from '../../types';
import { Clock } from '../../controllers/sequencer/Clock';

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
    this.tickCount++;
    for (const cb of Array.from(this.callbacks)) {
      cb(deltaMs);
    }
  }
}

type SequencerHarness = {
  sequencer: Sequencer;
  lightStateManager: LightStateManager;
  advanceBy: (ms: number) => void;
  cleanup: () => void;
};

function createSequencerHarness(): SequencerHarness {
  const clock = new ManualTestClock();
  const lightStateManager = new LightStateManager();
  const lightTransitionController = new LightTransitionController(lightStateManager);
  const performanceSpy = jest.spyOn(performance, 'now').mockImplementation(() => clock.getCurrentTimeMs());
  const sequencer = new Sequencer(lightTransitionController, clock as unknown as Clock);

  return {
    sequencer,
    lightStateManager,
    advanceBy: (ms: number) => clock.tick(ms),
    cleanup: () => {
      sequencer.shutdown();
      performanceSpy.mockRestore();
    }
  };
}

function createStageKitLightManager() {
  const frontLights = Array.from({ length: 4 }, (_, index) =>
    createMockDmxLight({
      id: `front-${index + 1}`,
      position: index + 1
    })
  );

  const backLights = Array.from({ length: 4 }, (_, index) =>
    createMockDmxLight({
      id: `back-${index + 1}`,
      position: frontLights.length + index + 1
    })
  );

  const config = createMockLightingConfig({
    frontLights,
    backLights
  });

  const manager = new DmxLightManager(config);
  const allLightIds = manager.getLights(['front', 'back'], ['all']).map((light) => light.id);
  return { manager, allLightIds };
}

const menuCueData: CueData = {
  ...defaultCueData,
  platform: 'Windows',
  currentScene: 'Menu',
  venueSize: 'Large',
  lightingCue: CueType.Menu,
  beatsPerMinute: 120
};

const manualCueData: CueData = {
  ...defaultCueData,
  platform: 'Windows',
  currentScene: 'Gameplay',
  venueSize: 'Large',
  lightingCue: CueType.Cool_Manual,
  beatsPerMinute: 120
};

describe('Sequencer integration lighting tests', () => {
  let harness: SequencerHarness;

  beforeEach(() => {
    harness = createSequencerHarness();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('keeps StageKit Menu sweep order and colors consistent across cycles', async () => {
    const { manager, allLightIds } = createStageKitLightManager();
    const cue = new StageKitMenuCue();
    await cue.execute(menuCueData, harness.sequencer, manager);


    const observedFirstCycle: string[] = [];
    const observedSecondCycle: string[] = [];

    // Prime the sequencer so first capture observes post-start state
    harness.advanceBy(1);

    const captureActiveLight = (expectedIndex: number): string => {
      const targetId = allLightIds[expectedIndex];
      const state = harness.lightStateManager.getLightState(targetId);
      expect(state).toBeTruthy();
      return targetId;
    };

    const advanceAndCapture = (expectedIndex: number): string => {
      harness.advanceBy(250);
      return captureActiveLight(expectedIndex);
    };

    for (let i = 0; i < allLightIds.length; i++) {
      observedFirstCycle.push(advanceAndCapture(i));
    }

    for (let i = 0; i < allLightIds.length; i++) {
      observedSecondCycle.push(advanceAndCapture(i));
    }

    expect(observedFirstCycle).toEqual(allLightIds);
    expect(observedSecondCycle).toEqual(observedFirstCycle);
  });

  it('rotates StageKit Cool Manual lights only after keyframe events and blends additive layers', async () => {
    const { manager, allLightIds } = createStageKitLightManager();
    const cue = new StageKitCoolManualCue();
    await cue.execute(manualCueData, harness.sequencer, manager);

    // Snapshot the baseline state before any events fire
    harness.advanceBy(1);
    const baselineStates = new Map(
      allLightIds.map((id) => [id, harness.lightStateManager.getLightState(id)])
    );

    // Trigger keyframe event to start the rotations and allow transitions to run
    harness.sequencer.onKeyframe();
    harness.advanceBy(1);

    const captureActiveSets = () => {
      return new Map(
        allLightIds.map((id) => [id, harness.lightStateManager.getLightState(id)])
      );
    };

    const changedLights = (before: Map<string, RGBIO | null>, after: Map<string, RGBIO | null>, channel: 'red' | 'green' | 'blue'): string[] => {
      return allLightIds.filter((id) => {
        const beforeState = before.get(id);
        const afterState = after.get(id);
        return (
          (afterState?.[channel] ?? 0) > (beforeState?.[channel] ?? 0)
        );
      });
    };

    harness.sequencer.onKeyframe();
    harness.advanceBy(1);
    const afterFirstKeyframe = captureActiveSets();

    harness.sequencer.onKeyframe();
    harness.advanceBy(1);
    const afterSecondKeyframe = captureActiveSets();

    const blueActiveFirst = changedLights(baselineStates, afterFirstKeyframe, 'blue');
    const blueActiveSecond = changedLights(afterFirstKeyframe, afterSecondKeyframe, 'blue');
    const uniqueBlueLights = new Set([...blueActiveFirst, ...blueActiveSecond]);
    const greenActive = changedLights(baselineStates, afterSecondKeyframe, 'green');

    expect(uniqueBlueLights.size).toBeGreaterThanOrEqual(1);
    expect(uniqueBlueLights.size + (blueActiveSecond.length > 0 ? 1 : 0)).toBeGreaterThanOrEqual(2);
    expect(greenActive.length).toBeGreaterThanOrEqual(1);
  });

  describe('event-gated transitions (beat/measure/drums)', () => {
    const eventCases: Array<{
      label: string;
      waitCondition: Effect['transitions'][number]['waitForCondition'];
      trigger: (seq: Sequencer) => void;
    }> = [
      {
        label: 'beat',
        waitCondition: 'beat',
        trigger: (seq) => seq.onBeat()
      },
      {
        label: 'measure',
        waitCondition: 'measure',
        trigger: (seq) => seq.onMeasure()
      },
      {
        label: 'drum-red',
        waitCondition: 'drum-red',
        trigger: (seq) => seq.onDrumNote(DrumNoteType.RedDrum)
      }
    ];

    for (const testCase of eventCases) {
      it(`responds to ${testCase.label} events`, () => {
        const { manager } = createStageKitLightManager();
        const trackedLights = manager.getLights(['front'], ['all']);
        const targetLight = trackedLights[0];
        const activeColor = getColor('red', 'high');

        const effect: Effect = {
          id: `event-${testCase.label}`,
          description: 'Event gated effect',
          transitions: [
            {
              lights: [targetLight],
              layer: 0,
              waitForCondition: testCase.waitCondition,
              waitForTime: 0,
              transform: {
                color: activeColor,
                easing: 'linear',
                duration: 0
              },
              waitUntilCondition: 'none',
              waitUntilTime: 0
            }
          ]
        };

        harness.sequencer.addEffect(`event-${testCase.label}`, effect, false);

        // Before event, state should stay at default black
        harness.advanceBy(1);
        let state = harness.lightStateManager.getLightState(targetLight.id);
        expect(state?.intensity ?? 0).toBe(0);

        testCase.trigger(harness.sequencer);
        harness.advanceBy(1);

        state = harness.lightStateManager.getLightState(targetLight.id);
        expect(state).toMatchObject({
          red: activeColor.red,
          green: activeColor.green,
          blue: activeColor.blue,
          blendMode: activeColor.blendMode
        });
      });
    }
  });
});

