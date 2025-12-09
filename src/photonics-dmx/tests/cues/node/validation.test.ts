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
            effectType: 'single-color',
            target: { groups: ['front'], filter: 'all' },
            color: { name: 'blue', brightness: 'medium', blendMode: 'replace' },
            timing: {
              waitForCondition: 'none',
              waitForTime: 0,
              duration: 200,
              waitUntilCondition: 'none',
              waitUntilTime: 0,
              easing: 'sinInOut',
              level: 1
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
            effectType: 'single-color',
            target: { groups: ['front'], filter: 'all' },
            color: { name: 'red', brightness: 'high', blendMode: 'add' },
            timing: {
              waitForCondition: 'none',
              waitForTime: 0,
              duration: 150,
              waitUntilCondition: 'delay',
              waitUntilTime: 100,
              easing: 'sinInOut',
              level: 1
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
            effectType: 'single-color',
            target: { groups: ['front'], filter: 'all' },
            color: { name: 'blue', brightness: 'medium', blendMode: 'replace' },
            timing: {
              waitForCondition: 'none',
              waitForTime: 0,
              duration: 100,
              waitUntilCondition: 'none',
              waitUntilTime: 0,
              easing: 'sinInOut',
              level: 1
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

    const invalid = validateYargNodeCueFile({
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
    expect(invalid.valid).toBe(false);
  });
});
