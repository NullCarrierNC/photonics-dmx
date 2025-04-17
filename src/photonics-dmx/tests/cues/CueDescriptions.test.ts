import { CueRegistry } from '../../cues/CueRegistry';
import { ICueImplementation } from '../../cues/interfaces/ICueImplementation';
import { ICueGroup } from '../../cues/interfaces/ICueGroup';
import { CueData, CueType } from '../../cues/cueTypes';
import { ILightingController } from '../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../controllers/DmxLightManager';
import { beforeEach, describe, it, expect } from '@jest/globals';

// Mock implementations with descriptions
class MockCueImplementation implements ICueImplementation {
  constructor(
    private _name: string,
    private _description?: string
  ) {}
  
  get name(): string { return this._name; }
  get description(): string | undefined { return this._description; }
  
  async execute(_data: CueData, _controller: ILightingController, _lightManager: DmxLightManager): Promise<void> {
    // Mock implementation
  }
}

describe('Cue Descriptions', () => {
  let registry: CueRegistry;
  let defaultGroup: ICueGroup;
  let customGroup: ICueGroup;

  beforeEach(() => {
    registry = CueRegistry.getInstance();
    registry.reset(); // Clear any existing groups

    // Create default group with descriptions
    defaultGroup = {
      name: 'default',
      description: 'Default cue group with standard effects',
      cues: new Map([
        [CueType.Default, new MockCueImplementation('default', 'Default yellow lighting on front lights')],
        [CueType.Chorus, new MockCueImplementation('default-chorus', 'Alternating randomly between Amber/Purple/Yellow/Red')],
      ]),
    };

    // Create custom group with descriptions
    customGroup = {
      name: 'custom',
      description: 'Custom cue group with specialized effects',
      cues: new Map([
        [CueType.Chorus, new MockCueImplementation('custom-chorus', 'Custom chorus effect with blue pulsing')],
        [CueType.Verse, new MockCueImplementation('custom-verse', 'Custom verse effect with green sweeping')],
      ]),
    };

    // Register the groups
    registry.registerGroup(defaultGroup);
    registry.registerGroup(customGroup);
  });

  describe('Cue Implementation Descriptions', () => {
    it('should retrieve description from cue implementation', () => {
      const implementation = registry.getCueImplementation(CueType.Default);
      expect(implementation).toBeDefined();
      expect(implementation?.description).toBe('Default yellow lighting on front lights');
    });

    it('should retrieve description from active group implementation', () => {
      registry.setActiveGroups(['custom']);
      const implementation = registry.getCueImplementation(CueType.Chorus);
      expect(implementation).toBeDefined();
      expect(implementation?.description).toBe('Custom chorus effect with blue pulsing');
    });

    it('should fall back to default group and get its description if cue not in active group', () => {
      registry.setActiveGroups(['custom']);
      const implementation = registry.getCueImplementation(CueType.Default);
      expect(implementation).toBeDefined();
      expect(implementation?.description).toBe('Default yellow lighting on front lights');
    });
  });

  describe('Group Descriptions', () => {
    it('should retrieve group description', () => {
      const group = registry.getGroup('default');
      expect(group).toBeDefined();
      expect(group?.description).toBe('Default cue group with standard effects');
    });

    it('should handle undefined description gracefully', () => {
      // Create a group without a description
      const noDescGroup: ICueGroup = {
        name: 'no-desc',
        cues: new Map([
          [CueType.Default, new MockCueImplementation('no-desc-default')]
        ])
      };
      
      registry.registerGroup(noDescGroup);
      const group = registry.getGroup('no-desc');
      expect(group).toBeDefined();
      expect(group?.description).toBeUndefined();
    });
  });

  describe('getGroup Method', () => {
    it('should return the correct group by name', () => {
      const group = registry.getGroup('custom');
      expect(group).toBeDefined();
      expect(group?.name).toBe('custom');
      expect(group?.description).toBe('Custom cue group with specialized effects');
      expect(group?.cues.size).toBe(2);
    });

    it('should return undefined for a group that doesn\'t exist', () => {
      const group = registry.getGroup('non-existent');
      expect(group).toBeUndefined();
    });
  });

  describe('CueImplementation Collection', () => {
    it('should collect all implementations with descriptions from a group', () => {
      const group = registry.getGroup('default');
      expect(group).toBeDefined();
      
      if (group) {
        const cueDescriptions = Array.from(group.cues.entries()).map(([cueType, implementation]) => ({
          id: cueType,
          description: implementation.description || 'No description available'
        }));
        
        expect(cueDescriptions).toHaveLength(2);
        expect(cueDescriptions[0]).toMatchObject({
          id: CueType.Default,
          description: 'Default yellow lighting on front lights'
        });
        expect(cueDescriptions[1]).toMatchObject({
          id: CueType.Chorus,
          description: 'Alternating randomly between Amber/Purple/Yellow/Red'
        });
      }
    });
  });
}); 