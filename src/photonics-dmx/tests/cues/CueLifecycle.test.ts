import { ICue, CueStyle } from '../../cues/interfaces/ICue';
import { CueData } from '../../cues/cueTypes';
import { ILightingController } from '../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../controllers/DmxLightManager';

// Simple test for ICue lifecycle methods
class TestLifecycleCue implements ICue {
  cueId = 'test-cue';
  id = `test-cue-${Math.random().toString(36).substring(2, 11)}`;
  description = 'Test cue for lifecycle';
  style = CueStyle.Primary;
  onStopCalled = false;
  onPauseCalled = false;
  onDestroyCalled = false;

  async execute(_parameters: CueData, _sequencer: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // Mock execution
  }

  onStop(): void {
    this.onStopCalled = true;
  }

  onPause(): void {
    this.onPauseCalled = true;
  }

  onDestroy(): void {
    this.onDestroyCalled = true;
  }
}

describe('ICue Lifecycle Methods', () => {
  let testCue: TestLifecycleCue;

  beforeEach(() => {
    testCue = new TestLifecycleCue();
  });

  it('should have lifecycle methods available', () => {
    expect(testCue.onStop).toBeDefined();
    expect(testCue.onPause).toBeDefined();
    expect(testCue.onDestroy).toBeDefined();
  });

  it('should track when lifecycle methods are called', () => {
    expect(testCue.onStopCalled).toBe(false);
    expect(testCue.onPauseCalled).toBe(false);
    expect(testCue.onDestroyCalled).toBe(false);

    testCue.onStop();
    expect(testCue.onStopCalled).toBe(true);

    testCue.onPause();
    expect(testCue.onPauseCalled).toBe(true);

    testCue.onDestroy();
    expect(testCue.onDestroyCalled).toBe(true);
  });

  it('should allow multiple calls to lifecycle methods', () => {
    testCue.onStop();
    testCue.onStop();
    expect(testCue.onStopCalled).toBe(true);

    testCue.onDestroy();
    testCue.onDestroy();
    expect(testCue.onDestroyCalled).toBe(true);
  });
}); 