import { CueRegistry } from '../../../photonics-dmx/cues/CueRegistry';
import { ICue } from '../../../photonics-dmx/cues/interfaces/ICue';
import { ICueGroup } from '../../../photonics-dmx/cues/interfaces/ICueGroup';
import { CueData, CueType } from '../../../photonics-dmx/cues/cueTypes';
import { ILightingController } from '../../../photonics-dmx/controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../photonics-dmx/controllers/DmxLightManager';
import { beforeEach, describe, it, expect, jest } from '@jest/globals';

// Mock IPC and Controller Manager
const mockIpcMain = {
  handle: jest.fn() as jest.MockedFunction<any>,
  on: jest.fn()
};

const mockControllerManager = {
  getSenderManager: jest.fn().mockReturnValue({
    enableSender: jest.fn(),
    disableSender: jest.fn()
  }),
  getCueHandler: jest.fn(),
  getLightingController: jest.fn(),
  getIsInitialized: jest.fn().mockReturnValue(true),
  getIsYargEnabled: jest.fn().mockReturnValue(true),
  getIsRb3Enabled: jest.fn().mockReturnValue(false),
  init: jest.fn(),
  startTestEffect: jest.fn(),
  stopTestEffect: jest.fn()
};

// Mock implementation with descriptions
class MockCueImplementation implements ICue {
  constructor(
    private _name: string,
    private _description?: string
  ) {}
  
  get name(): string { return this._name; }
  get description(): string | undefined { return this._description; }
  
  async execute(_data: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // Mock implementation
  }

  onStop(): void {
    // Mock lifecycle method
  }

  onPause(): void {
    // Mock lifecycle method
  }

  onDestroy(): void {
    // Mock lifecycle method
  }
}

// Import the module under test - need to mock this import
jest.mock('electron', () => ({
  ipcMain: mockIpcMain
}));

// Import the setup function
import { setupLightHandlers } from '../../ipc/light-handlers';

describe('IPC Light Handlers for Cue Registry', () => {
  let registry: CueRegistry;
  let defaultGroup: ICueGroup;
  let customGroup: ICueGroup;

  // Store the original handlers for each IPC endpoint
  let getCueGroupsHandler: (event: unknown, ...args: any[]) => Promise<any>;
  let setActiveGroupsHandler: (event: unknown, groupNames: string[]) => Promise<any>;
  let getAvailableCuesHandler: (event: unknown, groupName?: string) => Promise<any>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Capture the handlers when they're registered
    mockIpcMain.handle.mockImplementation((channel: string, handler: any) => {
      if (channel === 'get-cue-groups') {
        getCueGroupsHandler = handler;
      } else if (channel === 'set-active-cue-groups') {
        setActiveGroupsHandler = handler;
      } else if (channel === 'get-available-cues') {
        getAvailableCuesHandler = handler;
      }
    });

    // Setup the handlers - this will register our mock handlers
    setupLightHandlers(mockIpcMain as any, mockControllerManager as any);

    // Get the registry and reset it
    registry = CueRegistry.getInstance();
    registry.reset();

    // Create test groups
    defaultGroup = {
      name: 'default',
      description: 'Default cue group with standard effects',
      cues: new Map([
        [CueType.Default, new MockCueImplementation('default', 'Default yellow lighting on front lights')],
        [CueType.Chorus, new MockCueImplementation('default-chorus', 'Chorus effect with color changes')],
      ]),
    };

    customGroup = {
      name: 'custom',
      description: 'Custom effects group',
      cues: new Map([
        [CueType.Chorus, new MockCueImplementation('custom-chorus', 'Custom chorus with blue effects')],
        [CueType.Verse, new MockCueImplementation('custom-verse', 'Custom verse with green effects')], 
      ]),
    };

    // Register the groups AND set the default group
    registry.registerGroup(defaultGroup);
    registry.registerGroup(customGroup);
    registry.setDefaultGroup(defaultGroup.name);
  });

  describe('get-cue-groups handler', () => {
    it('should return all registered groups with their descriptions', async () => {
      const groupInfo = await getCueGroupsHandler({});
      
      expect(groupInfo).toHaveLength(2);
      expect(groupInfo).toContainEqual({
        name: 'default',
        description: 'Default cue group with standard effects',
        cueTypes: [CueType.Default, CueType.Chorus]
      });
      expect(groupInfo).toContainEqual({
        name: 'custom',
        description: 'Custom effects group',
        cueTypes: [CueType.Chorus, CueType.Verse]
      });
    });

    it('should use fallback description if group has no description', async () => {
      // Add a group without a description
      const noDescGroup: ICueGroup = {
        name: 'no-desc',
        cues: new Map([
          [CueType.Default, new MockCueImplementation('no-desc-default')]
        ])
      };
      registry.registerGroup(noDescGroup);
      
      const groupInfo = await getCueGroupsHandler({});
      const noDescGroupInfo = groupInfo.find((g: any) => g.name === 'no-desc');
      
      expect(noDescGroupInfo).toBeDefined();
      expect(noDescGroupInfo.description).toBe('no-desc cue group');
    });
  });

  describe('set-active-cue-groups handler', () => {
    it('should set the active groups and include default', async () => {
      const result = await setActiveGroupsHandler({}, ['custom']);
      
      // Expect detailed response, including the default group
      expect(result).toEqual({
        success: true,
        activeGroups: expect.arrayContaining(['custom', 'default']),
        invalidGroups: undefined
      });
      expect(result.activeGroups).toHaveLength(2);
      expect(registry.getActiveGroups()).toEqual(expect.arrayContaining(['custom', 'default']));
      expect(registry.getActiveGroups()).toHaveLength(2);
    });

    it('should set multiple active groups correctly', async () => {
      const result = await setActiveGroupsHandler({}, ['custom', 'default']);
      
      // Expect detailed response
      expect(result).toEqual({
        success: true,
        activeGroups: expect.arrayContaining(['custom', 'default']),
        invalidGroups: undefined
      });
      expect(result.activeGroups).toHaveLength(2);
      expect(registry.getActiveGroups()).toEqual(expect.arrayContaining(['custom', 'default']));
      expect(registry.getActiveGroups()).toHaveLength(2);
    });

    it('should return error for empty array', async () => {
      await setActiveGroupsHandler({}, ['custom']); // Set one first
      const result = await setActiveGroupsHandler({}, []);
      
      // Expect failure response
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('No valid groups provided') // Check for error message
      });
      // Ensure registry didn't actually clear (due to handler validation)
      expect(registry.getActiveGroups()).toEqual(expect.arrayContaining(['custom', 'default'])); 
    });

    it('should ignore non-existent groups and return invalid ones', async () => {
      const result = await setActiveGroupsHandler({}, ['custom', 'non-existent']);
      
      // Expect detailed response including default and the invalid group
      expect(result).toEqual({
        success: true,
        activeGroups: expect.arrayContaining(['custom', 'default']),
        invalidGroups: ['non-existent']
      });
      expect(result.activeGroups).toHaveLength(2);
      // Verify registry state reflects only the valid + default group
      expect(registry.getActiveGroups()).toEqual(expect.arrayContaining(['custom', 'default']));
      expect(registry.getActiveGroups()).toHaveLength(2);
    });
  });

  describe('get-available-cues handler', () => {
    it('should return cue descriptions for the specified group', async () => {
      const cues = await getAvailableCuesHandler({}, 'custom');
      
      expect(cues).toHaveLength(2);
      expect(cues).toContainEqual(expect.objectContaining({
        id: CueType.Chorus,
        yargDescription: 'Custom chorus with blue effects',
        groupName: 'custom'
      }));
      expect(cues).toContainEqual(expect.objectContaining({
        id: CueType.Verse,
        yargDescription: 'Custom verse with green effects',
        groupName: 'custom'
      }));
    });

    it('should use "No description available" for cues without descriptions', async () => {
      // Add a group with a cue that has no description
      const noDescCueGroup: ICueGroup = {
        name: 'no-desc-cue',
        cues: new Map([
          [CueType.Default, new MockCueImplementation('no-desc-cue-default')]
        ])
      };
      registry.registerGroup(noDescCueGroup);
      
      const cues = await getAvailableCuesHandler({}, 'no-desc-cue');
      
      expect(cues).toHaveLength(1);
      expect(cues[0]).toEqual(expect.objectContaining({
        id: CueType.Default,
        yargDescription: 'No description available',
        groupName: 'no-desc-cue'
      }));
    });

    it('should default to "default" group if no group name provided', async () => {
      const cues = await getAvailableCuesHandler({});
      
      expect(cues).toHaveLength(2);
      expect(cues).toContainEqual(expect.objectContaining({
        id: CueType.Default,
        yargDescription: 'Default yellow lighting on front lights',
        groupName: 'default'
      }));
    });

    it('should return empty array for a group that doesn\'t exist', async () => {
      const cues = await getAvailableCuesHandler({}, 'non-existent');
      expect(cues).toEqual([]);
    });
  });
}); 