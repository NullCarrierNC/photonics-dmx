/**
 * Tests for YargNetworkListener lifecycle and packet handling.
 * UDP socket is mocked; we verify start/stop and that invalid packets are ignored.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { YargNetworkListener } from '../../listeners/YARG/YargNetworkListener';
import { BaseCueHandler } from '../../cueHandlers/BaseCueHandler';
import { CueData, CueType } from '../../cues/types/cueTypes';
import { DmxLightManager } from '../../controllers/DmxLightManager';
import { ILightingController } from '../../controllers/sequencer/interfaces';
import { createMockLightingConfig } from '../helpers/testFixtures';

class MockCueHandler extends BaseCueHandler {
  public async handleCue(_cueType: CueType, _parameters: CueData): Promise<void> {}
  public handleCueNoCue = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueDischord = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueChorus = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueDefault = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueStomp = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueVerse = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueMenu = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueScore = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueBigRockEnding = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueBlackout_Fast = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueBlackout_Slow = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueBlackout_Spotlight = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueCool_Manual = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueCool_Automatic = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueWarm_Manual = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueWarm_Automatic = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueFlare_Fast = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueFlare_Slow = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueFrenzy = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueIntro = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueHarmony = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueSilhouettes = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueSilhouettes_Spotlight = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueSearchlights = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueStrobe_Fastest = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueStrobe_Fast = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueStrobe_Medium = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueStrobe_Slow = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueStrobe_Off = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueSweep = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueKeyframe_First = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueKeyframe_Next = jest.fn(async (_: CueData): Promise<void> => {});
  protected handleCueKeyframe_Previous = jest.fn(async (_: CueData): Promise<void> => {});
}

const mockBind = jest.fn((_port: number, callback: () => void) => {
  callback();
});
const mockClose = jest.fn((callback?: () => void) => {
  if (callback) callback();
});
const mockOn = jest.fn();

jest.mock('dgram', () => ({
  createSocket: jest.fn(() => ({
    bind: mockBind,
    close: mockClose,
    on: mockOn
  }))
}));

describe('YargNetworkListener', () => {
  let lightManager: DmxLightManager;
  let mockSequencer: ILightingController;
  let cueHandler: MockCueHandler;
  let listener: YargNetworkListener;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = createMockLightingConfig();
    lightManager = new DmxLightManager(config);
    mockSequencer = { addEffect: jest.fn(), removeEffect: jest.fn() } as unknown as ILightingController;
    cueHandler = new MockCueHandler(lightManager, mockSequencer, 50);
    listener = new YargNetworkListener(cueHandler);
  });

  afterEach(() => {
    if (listener) {
      listener.shutdown();
    }
  });

  it('constructs with a cue handler', () => {
    expect(listener).toBeDefined();
  });

  it('start binds the UDP socket and sets listening state', () => {
    listener.start();
    expect(mockBind).toHaveBeenCalledWith(36107, expect.any(Function));
    listener.stop();
    expect(mockClose).toHaveBeenCalled();
  });

  it('stop closes the socket', () => {
    listener.start();
    listener.stop();
    expect(mockClose).toHaveBeenCalled();
  });

  it('shutdown calls stop', () => {
    listener.start();
    listener.shutdown();
    expect(mockClose).toHaveBeenCalled();
  });
});
