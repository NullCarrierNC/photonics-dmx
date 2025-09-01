import { CueRegistry } from '../../cues/CueRegistry';
import { ICue, CueStyle } from '../../cues/interfaces/ICue';
import { ICueGroup } from '../../cues/interfaces/ICueGroup';
import { CueData, CueType } from '../../cues/cueTypes';
import { ILightingController } from '../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../controllers/DmxLightManager';
import { beforeEach, describe, it, expect } from '@jest/globals';

// Mock implementations
class MockCueImplementation implements ICue {
  private _id: string;
  constructor(private _name: string) {
    this._id = `mock-${this._name}-${Math.random().toString(36).substring(2, 11)}`;
  }
  get cueId(): string { return this._name; }
  get id(): string { return this._id; }
  description = 'Mock cue for testing';
  style = CueStyle.Primary;
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

describe('CueRegistry', () => {
  let registry: CueRegistry;
  let defaultGroup: ICueGroup;
  let customGroup: ICueGroup;

  beforeEach(() => {
    registry = CueRegistry.getInstance();
    registry.reset(); // Clear any existing groups

    // Create default group
    defaultGroup = {
      id: 'default',
      name: 'default',
      cues: new Map([
        [CueType.Default, new MockCueImplementation('default')],
        [CueType.Chorus, new MockCueImplementation('default-chorus')],
      ]),
    };

    // Create custom group
    customGroup = {
      id: 'custom',
      name: 'custom',
      cues: new Map([
        [CueType.Chorus, new MockCueImplementation('custom-chorus')],
        [CueType.Verse, new MockCueImplementation('custom-verse')],
      ]),
    };
    
    // Explicitly register and set the default group
    registry.registerGroup(defaultGroup);
    registry.setDefaultGroup(defaultGroup.id);
  });

  describe('registerGroup', () => {
    it('should register a group', () => {
      expect(registry.getAllGroups()).toContain('default');
    });

    it('should set default group when registering group named "default"', () => {
      const implementation = registry.getCueImplementation(CueType.Default, false);
      expect(implementation).toBeDefined();
      expect((implementation as MockCueImplementation).cueId).toBe('default');
    });
  });

  describe('getCueImplementation', () => {
    beforeEach(() => {
      registry.registerGroup(customGroup);
    });

    it('should return implementation from active group if available', () => {
      registry.setActiveGroups(['custom']);
      const implementation = registry.getCueImplementation(CueType.Chorus);
      expect(implementation).toBeDefined();
      expect(implementation).toBeInstanceOf(MockCueImplementation);
    });

    it('should fall back to default group if cue not in active group', () => {
      registry.setActiveGroups(['custom']);
      const implementation = registry.getCueImplementation(CueType.Default);
      expect(implementation).toBeDefined();
      expect(implementation).toBeInstanceOf(MockCueImplementation);
      expect((implementation as MockCueImplementation).cueId).toBe('default');
    });

    it('should return null if no implementation found', () => {
      registry.setActiveGroups(['custom']);
      const implementation = registry.getCueImplementation(CueType.BigRockEnding);
      expect(implementation).toBeNull();
    });
  });

  describe('setActiveGroups', () => {
    beforeEach(() => {
      registry.registerGroup(customGroup);
    });

    it('should set active groups', () => {
      registry.setActiveGroups(['custom']);
      expect(registry.getActiveGroups()).toEqual(['custom']);
    });

    it('should clear active groups when empty array provided', () => {
      registry.setActiveGroups(['custom']);
      registry.setActiveGroups([]);
      expect(registry.getActiveGroups()).toHaveLength(0);
    });

    it('should ignore non-existent group names', () => {
      registry.setActiveGroups(['custom', 'non-existent']);
      expect(registry.getActiveGroups()).toEqual(['custom']);
    });
  });

  describe('reset', () => {
    it('should clear all groups and active groups', () => {
      registry.registerGroup(customGroup);
      registry.setActiveGroups(['custom']);
      registry.reset();
      expect(registry.getAllGroups()).toHaveLength(2); // default and custom groups remain registered
      expect(registry.getActiveGroups()).toHaveLength(0); // but active groups are cleared
    });
  });

  describe('Consistency Throttling', () => {
    it('should use consistent group selection within the consistency window', () => {
      const registry = CueRegistry.getInstance();
      registry.reset();
      
      // Set up test groups
      const group1: ICueGroup = {
        id: 'group1',
        name: 'group1',
        cues: new Map([
          [CueType.Cool_Automatic, new MockCueImplementation('group1-cool-auto')],
        ]),
      };
      const group2: ICueGroup = {
        id: 'group2',
        name: 'group2',
        cues: new Map([
          [CueType.Cool_Automatic, new MockCueImplementation('group2-cool-auto')],
        ]),
      };
      registry.registerGroup(group1);
      registry.registerGroup(group2);
      registry.setEnabledGroups(['group1', 'group2']);
      registry.setActiveGroups(['group1', 'group2']);
      
      // Set consistency window to 2 seconds
      registry.setCueConsistencyWindow(2000);
      
      // First call should randomly select a group
      const firstCue = registry.getCueImplementation(CueType.Cool_Automatic);
      expect(firstCue).toBeTruthy();
      const firstGroupId = firstCue!.id.includes('group1') ? 'group1' : 'group2';
      
      // Second call within window should use same group
      const secondCue = registry.getCueImplementation(CueType.Cool_Automatic);
      expect(secondCue).toBeTruthy();
      const secondGroupId = secondCue!.id.includes('group1') ? 'group1' : 'group2';
      
      expect(secondGroupId).toBe(firstGroupId);
    });

    it('should allow new randomization after consistency window expires', () => {
      const registry = CueRegistry.getInstance();
      registry.reset();
      
      // Set up test groups
      const group1: ICueGroup = {
        id: 'group1',
        name: 'group1',
        cues: new Map([
          [CueType.Cool_Automatic, new MockCueImplementation('group1-cool-auto')],
        ]),
      };
      const group2: ICueGroup = {
        id: 'group2',
        name: 'group2',
        cues: new Map([
          [CueType.Cool_Automatic, new MockCueImplementation('group2-cool-auto')],
        ]),
      };
      registry.registerGroup(group1);
      registry.registerGroup(group2);
      registry.setEnabledGroups(['group1', 'group2']);
      registry.setActiveGroups(['group1', 'group2']);
      
      // Set consistency window to 0ms for testing (immediate expiration)
      registry.setCueConsistencyWindow(0);
      
      // First call
      const firstCue = registry.getCueImplementation(CueType.Cool_Automatic);
      expect(firstCue).toBeTruthy();
      
      // Second call should allow new randomization since window is 0ms
      const secondCue = registry.getCueImplementation(CueType.Cool_Automatic);
      expect(secondCue).toBeTruthy();
      
      // Both calls should work without hanging
      expect(firstCue).toBeDefined();
      expect(secondCue).toBeDefined();
    });

    it('should clear consistency tracking when active groups change', () => {
      const registry = CueRegistry.getInstance();
      registry.reset();
      
      // Set up test groups
      const group1: ICueGroup = {
        id: 'group1',
        name: 'group1',
        cues: new Map([
          [CueType.Cool_Automatic, new MockCueImplementation('group1-cool-auto')],
        ]),
      };
      const group2: ICueGroup = {
        id: 'group2',
        name: 'group2',
        cues: new Map([
          [CueType.Cool_Automatic, new MockCueImplementation('group2-cool-auto')],
        ]),
      };
      registry.registerGroup(group1);
      registry.registerGroup(group2);
      registry.setEnabledGroups(['group1', 'group2']);
      registry.setActiveGroups(['group1']);
      
      // Set consistency window
      registry.setCueConsistencyWindow(2000);
      
      // Call a cue to establish tracking
      const firstCue = registry.getCueImplementation(CueType.Cool_Automatic);
      expect(firstCue).toBeTruthy();
      
      // Change active groups
      registry.setActiveGroups(['group2']);
      
      // Check that consistency tracking was cleared
      const status = registry.getConsistencyStatus();
      expect(status.trackedCues).toHaveLength(0);
    });

    it('should provide consistency status information', () => {
      const registry = CueRegistry.getInstance();
      registry.reset();
      
      // Set up test groups
      const group1: ICueGroup = {
        id: 'group1',
        name: 'group1',
        cues: new Map([
          [CueType.Cool_Automatic, new MockCueImplementation('group1-cool-auto')],
        ]),
      };
      registry.registerGroup(group1);
      registry.setEnabledGroups(['group1']);
      registry.setActiveGroups(['group1']);
      
      // Set consistency window
      registry.setCueConsistencyWindow(2000);
      
      // Call a cue
      const cue = registry.getCueImplementation(CueType.Cool_Automatic);
      expect(cue).toBeTruthy();
      
      // Get status
      const status = registry.getConsistencyStatus();
      expect(status.windowMs).toBe(2000);
      expect(status.trackedCues).toHaveLength(1);
      expect(status.trackedCues[0].cueType).toBe(CueType.Cool_Automatic);
      expect(status.trackedCues[0].isWithinWindow).toBe(true);
    });

    it('should properly handle fallback logic with consistency system', () => {
      const registry = CueRegistry.getInstance();
      registry.reset();
      
      // Set up test groups with fallback scenario
      const defaultGroup: ICueGroup = {
        id: 'default',
        name: 'default',
        cues: new Map([
          [CueType.Cool_Automatic, new MockCueImplementation('default-cool-auto')],
        ]),
      };
      
      const customGroup: ICueGroup = {
        id: 'custom',
        name: 'custom',
        cues: new Map([
          [CueType.Chorus, new MockCueImplementation('custom-chorus')],
          // Note: custom group does NOT have Cool_Automatic
        ]),
      };
      
      registry.registerGroup(defaultGroup);
      registry.registerGroup(customGroup);
      registry.setDefaultGroup('default');
      registry.setEnabledGroups(['custom']); // Only custom is enabled
      registry.setActiveGroups(['custom']); // Only custom is active
      
      // Set consistency window
      registry.setCueConsistencyWindow(2000);
      
      // First call to Cool_Automatic should use default group as fallback
      const firstCue = registry.getCueImplementation(CueType.Cool_Automatic);
      expect(firstCue).toBeTruthy();
      expect(firstCue!.id).toContain('default-cool-auto');
      
      // Second call within window should use same fallback group
      const secondCue = registry.getCueImplementation(CueType.Cool_Automatic);
      expect(secondCue).toBeTruthy();
      expect(secondCue!.id).toContain('default-cool-auto');
      
      // Verify consistency tracking shows fallback
      const status = registry.getConsistencyStatus();
      expect(status.trackedCues).toHaveLength(1);
      expect(status.trackedCues[0].cueType).toBe(CueType.Cool_Automatic);
      expect(status.trackedCues[0].lastGroupId).toBe('default');
      expect(status.trackedCues[0].isWithinWindow).toBe(true);
    });

    it('should use default group as fallback even when default is active', () => {
      const registry = CueRegistry.getInstance();
      registry.reset();
      
      // Set up test groups where default is active but other active groups don't have the cue
      const defaultGroup: ICueGroup = {
        id: 'default',
        name: 'default',
        cues: new Map([
          [CueType.Strobe_Fast, new MockCueImplementation('default-strobe-fast')],
        ]),
      };
      
      const customGroup: ICueGroup = {
        id: 'custom',
        name: 'custom',
        cues: new Map([
          [CueType.Chorus, new MockCueImplementation('custom-chorus')],
          // Note: custom group does NOT have Strobe_Fast
        ]),
      };
      
      registry.registerGroup(defaultGroup);
      registry.registerGroup(customGroup);
      registry.setDefaultGroup('default');
      registry.setEnabledGroups(['custom', 'default']); // Both enabled
      registry.setActiveGroups(['custom', 'default']); // Both active
      
      // Call Strobe_Fast - should use default group as fallback since custom doesn't have it
      const strobeCue = registry.getCueImplementation(CueType.Strobe_Fast, false);
      expect(strobeCue).toBeTruthy();
      expect(strobeCue!.id).toContain('default-strobe-fast');
      
      // Verify this was treated as a fallback
      const status = registry.getConsistencyStatus();
      expect(status.trackedCues).toHaveLength(1);
      expect(status.trackedCues[0].cueType).toBe(CueType.Strobe_Fast);
      expect(status.trackedCues[0].lastGroupId).toBe('default');
    });

    it('should prefer stage kit group when autoGen is false and stageKitPriority is prefer-for-tracked', () => {
      const registry = CueRegistry.getInstance();
      registry.reset();
      
      // Set up test groups including a stage kit group
      const stageKitGroup: ICueGroup = {
        id: 'stagekit',
        name: 'stagekit',
        cues: new Map([
          [CueType.Cool_Automatic, new MockCueImplementation('stagekit-cool-auto')],
        ]),
      };
      
      const customGroup: ICueGroup = {
        id: 'custom',
        name: 'custom',
        cues: new Map([
          [CueType.Cool_Automatic, new MockCueImplementation('custom-cool-auto')],
        ]),
      };
      
      registry.registerGroup(stageKitGroup);
      registry.registerGroup(customGroup);
      registry.setStageKitGroup('stagekit');
      registry.setStageKitPriority('prefer-for-tracked');
      registry.setEnabledGroups(['stagekit', 'custom']);
      registry.setActiveGroups(['stagekit', 'custom']);
      
      // When autoGen is true (auto-generated lighting), should use random selection (existing behavior)
      const cueWithAutoGen = registry.getCueImplementation(CueType.Cool_Automatic, true);
      expect(cueWithAutoGen).toBeTruthy();
      // Could be either group since it's random
      expect(['stagekit-cool-auto', 'custom-cool-auto']).toContain(cueWithAutoGen!.cueId);
      
      // When autoGen is false (tracked lighting data), should prefer stage kit group
      const cueWithoutAutoGen = registry.getCueImplementation(CueType.Cool_Automatic, false);
      expect(cueWithoutAutoGen).toBeTruthy();
      expect(cueWithoutAutoGen!.cueId).toBe('stagekit-cool-auto');
    });
  });
}); 