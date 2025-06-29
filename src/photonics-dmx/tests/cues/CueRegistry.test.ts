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
      const implementation = registry.getCueImplementation(CueType.Default);
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

      expect(registry.getAllGroups()).toHaveLength(0);
      expect(registry.getActiveGroups()).toHaveLength(0);
    });
  });
}); 