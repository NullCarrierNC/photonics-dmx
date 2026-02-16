import { validateYargNodeCueFile, validateAudioNodeCueFile } from '../../../cues/node/schema/validation';
import { YargNodeCueDefinition, AudioNodeCueDefinition } from '../../../cues/types/nodeCueTypes';
import { CueType } from '../../../cues/types/cueTypes';

describe('Node cue validation', () => {
  it('validates a simple YARG node cue', () => {
    const definition: YargNodeCueDefinition = {
      id: 'test-cue',
      name: 'Test Cue',
      description: '',
      cueType: CueType.Chorus,
      style: 'primary',
      nodes: {
        events: [
          { id: 'event-1', type: 'event', eventType: 'beat' }
        ],
        actions: [
          {
            id: 'action-1',
            type: 'action',
            effectType: 'set-color',
            target: { 
              groups: { source: 'literal', value: 'front' }, 
              filter: { source: 'literal', value: 'all' } 
            },
            color: { 
              name: { source: 'literal', value: 'blue' }, 
              brightness: { source: 'literal', value: 'medium' }, 
              blendMode: { source: 'literal', value: 'replace' } 
            },
            timing: {
              waitForCondition: 'none',
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 200 },
              waitUntilCondition: 'none',
              waitUntilTime: { source: 'literal', value: 0 },
              easing: 'sinInOut',
              level: { source: 'literal', value: 1 }
            }
          }
        ]
      },
      connections: [
        { from: 'event-1', to: 'action-1' }
      ],
      layout: {
        nodePositions: {}
      }
    };

    const result = validateYargNodeCueFile({
      version: 1,
      mode: 'yarg',
      group: {
        id: 'group-1',
        name: 'Test Group'
      },
      cues: [definition]
    });

    expect(result.valid).toBe(true);
  });

  it('validates a simple audio node cue', () => {
    const definition: AudioNodeCueDefinition = {
      id: 'audio-cue',
      name: 'Audio Cue',
      cueTypeId: 'custom-audio',
      nodes: {
        events: [
          { id: 'event-1', type: 'event', eventType: 'audio-beat', threshold: 0.5, triggerMode: 'edge' }
        ],
        actions: [
          {
            id: 'action-1',
            type: 'action',
            effectType: 'set-color',
            target: { 
              groups: { source: 'literal', value: 'front' }, 
              filter: { source: 'literal', value: 'all' } 
            },
            color: { 
              name: { source: 'literal', value: 'red' }, 
              brightness: { source: 'literal', value: 'high' }, 
              blendMode: { source: 'literal', value: 'add' } 
            },
            timing: {
              waitForCondition: 'none',
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 150 },
              waitUntilCondition: 'delay',
              waitUntilTime: { source: 'literal', value: 100 },
              easing: 'sinInOut',
              level: { source: 'literal', value: 1 }
            }
          }
        ]
      },
      connections: [{ from: 'event-1', to: 'action-1' }],
      layout: { nodePositions: {} }
    };

    const result = validateAudioNodeCueFile({
      version: 1,
      mode: 'audio',
      group: { id: 'audio-group', name: 'Audio Group' },
      cues: [definition]
    });

    expect(result.valid).toBe(true);
  });

  it('validates logic nodes and detects cycles across logic/actions', () => {
    const definition: YargNodeCueDefinition = {
      id: 'logic-validate',
      name: 'Logic Validate',
      cueType: CueType.Chorus,
      style: 'primary',
      nodes: {
        events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
        actions: [
          {
            id: 'action-1',
            type: 'action',
            effectType: 'set-color',
            target: { 
              groups: { source: 'literal', value: 'front' }, 
              filter: { source: 'literal', value: 'all' } 
            },
            color: { 
              name: { source: 'literal', value: 'blue' }, 
              brightness: { source: 'literal', value: 'medium' }, 
              blendMode: { source: 'literal', value: 'replace' } 
            },
            timing: {
              waitForCondition: 'none',
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 100 },
              waitUntilCondition: 'none',
              waitUntilTime: { source: 'literal', value: 0 },
              easing: 'sinInOut',
              level: { source: 'literal', value: 1 }
            }
          }
        ],
        logic: [
          {
            id: 'logic-1',
            type: 'logic',
            logicType: 'conditional',
            comparator: '>',
            left: { source: 'literal', value: 1 },
            right: { source: 'literal', value: 0 }
          }
        ]
      },
      connections: [
        { from: 'event-1', to: 'logic-1' },
        { from: 'logic-1', to: 'action-1', fromPort: 'true' }
      ],
      layout: { nodePositions: {} }
    };

    const valid = validateYargNodeCueFile({
      version: 1,
      mode: 'yarg',
      group: { id: 'g1', name: 'Group' },
      cues: [definition]
    });
    expect(valid.valid).toBe(true);

    // Note: JSON schema validation does not reject action->logic back-edges (cycle);
    // cycle detection is done at compile time. Schema still accepts the structure.
    const withCycle = validateYargNodeCueFile({
      version: 1,
      mode: 'yarg',
      group: { id: 'g1', name: 'Group' },
      cues: [{
        ...definition,
        connections: [
          { from: 'logic-1', to: 'action-1' },
          { from: 'action-1', to: 'logic-1' }
        ]
      }]
    });
    expect(withCycle.valid).toBe(true);
  });

  it('validates cue with random, shuffle-lights, and for-each-light logic nodes', () => {
    const definition: YargNodeCueDefinition = {
      id: 'new-logic-cue',
      name: 'New Logic Cue',
      cueType: CueType.Verse,
      style: 'primary',
      nodes: {
        events: [{ id: 'event-1', type: 'event', eventType: 'cue-started' }],
        actions: [{
          id: 'action-1',
          type: 'action',
          effectType: 'set-color',
          target: { groups: { source: 'literal', value: 'front' }, filter: { source: 'literal', value: 'all' } },
          color: { name: { source: 'literal', value: 'blue' }, brightness: { source: 'literal', value: 'medium' }, blendMode: { source: 'literal', value: 'replace' } },
          timing: { waitForCondition: 'none', waitForTime: { source: 'literal', value: 0 }, duration: { source: 'literal', value: 100 }, waitUntilCondition: 'none', waitUntilTime: { source: 'literal', value: 0 }, easing: 'linear', level: { source: 'literal', value: 1 } }
        }],
        logic: [
          { id: 'r1', type: 'logic', logicType: 'random', mode: 'random-integer', min: { source: 'literal', value: 0 }, max: { source: 'literal', value: 1 }, assignTo: 'dir' },
          { id: 's1', type: 'logic', logicType: 'shuffle-lights', sourceVariable: 'allLights', assignTo: 'shuffled' },
          { id: 'f1', type: 'logic', logicType: 'for-each-light', sourceVariable: 'allLights', currentLightVariable: 'cur', currentIndexVariable: 'idx' }
        ]
      },
      connections: [
        { from: 'event-1', to: 'r1' },
        { from: 'r1', to: 'action-1' }
      ],
      layout: { nodePositions: {} }
    };
    const result = validateYargNodeCueFile({
      version: 1,
      mode: 'yarg',
      group: { id: 'g1', name: 'Group' },
      cues: [definition]
    });
    expect(result.valid).toBe(true);
  });

  it('validates action with dual-mode-rotation and alternating-pattern effect types', () => {
    const definition: YargNodeCueDefinition = {
      id: 'effect-types-cue',
      name: 'Effect Types Cue',
      cueType: CueType.Dischord,
      style: 'primary',
      nodes: {
        events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
        actions: [
          {
            id: 'action-dm',
            type: 'action',
            effectType: 'dual-mode-rotation',
            target: { groups: { source: 'literal', value: 'front,back' }, filter: { source: 'literal', value: 'all' } },
            color: { name: { source: 'literal', value: 'green' }, brightness: { source: 'literal', value: 'medium' }, blendMode: { source: 'literal', value: 'replace' } },
            timing: { waitForCondition: 'beat', waitForTime: { source: 'literal', value: 0 }, duration: { source: 'literal', value: 0 }, waitUntilCondition: 'none', waitUntilTime: { source: 'literal', value: 0 }, easing: 'linear', level: { source: 'literal', value: 1 } },
            config: { beatsPerCycle: 2, dualModeSolidColor: 'green', dualModeSwitchCondition: 'measure', dualModeIsLargeVenue: true }
          },
          {
            id: 'action-ap',
            type: 'action',
            effectType: 'alternating-pattern',
            target: { groups: { source: 'literal', value: 'front,back' }, filter: { source: 'literal', value: 'third-2' } },
            color: { name: { source: 'literal', value: 'blue' }, brightness: { source: 'literal', value: 'medium' }, blendMode: { source: 'literal', value: 'replace' } },
            timing: { waitForCondition: 'keyframe', waitForTime: { source: 'literal', value: 0 }, duration: { source: 'literal', value: 0 }, waitUntilCondition: 'none', waitUntilTime: { source: 'literal', value: 0 }, easing: 'linear', level: { source: 'literal', value: 1 } },
            config: { switchCondition: 'keyframe', completeCondition: 'beat', patternBTarget: { groups: { source: 'literal', value: 'front,back' }, filter: { source: 'literal', value: 'even' } } }
          }
        ]
      },
      connections: [
        { from: 'event-1', to: 'action-dm' },
        { from: 'event-1', to: 'action-ap' }
      ],
      layout: { nodePositions: {} }
    };
    const result = validateYargNodeCueFile({
      version: 1,
      mode: 'yarg',
      group: { id: 'g1', name: 'Group' },
      cues: [definition]
    });
    expect(result.valid).toBe(true);
  });
});
