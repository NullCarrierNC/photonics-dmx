import { validateYargNodeCueFile, validateAudioNodeCueFile } from '../../node/schema/validation';
import { NodeCueCompiler } from '../../node/compiler/NodeCueCompiler';
import { YargNodeCueDefinition, AudioNodeCueDefinition, createDefaultActionTiming } from '../../types/nodeCueTypes';
import { CueType } from '../../types/cueTypes';

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
              fadeIn: 100,
              hold: 200,
              fadeOut: 200,
              postDelay: 0,
              easeIn: 'sinInOut',
              easeOut: 'sinInOut',
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
            effectType: 'flash',
            target: { groups: ['front'], filter: 'all' },
            color: { name: 'red', brightness: 'high', blendMode: 'add' },
            timing: {
              fadeIn: 50,
              hold: 100,
              fadeOut: 120,
              postDelay: 0,
              easeIn: 'sinInOut',
              easeOut: 'sinInOut',
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

  it('throws when action lacks target or secondary color when required', () => {
    const definition: YargNodeCueDefinition = {
      id: 'test-cue',
      name: 'Test Cue',
      cueType: CueType.Chorus,
      style: 'primary',
      nodes: {
        events: [{ id: 'event-1', type: 'event', eventType: 'beat' }],
        actions: [
          {
            id: 'action-1',
            type: 'action',
            effectType: 'cross-fade',
            target: { groups: ['front'], filter: 'all' },
            color: { name: 'blue', brightness: 'medium', blendMode: 'replace' },
            timing: createDefaultActionTiming()
          }
        ]
      },
      connections: [{ from: 'event-1', to: 'action-1' }],
      layout: { nodePositions: {} }
    };

    expect(() => NodeCueCompiler.compileYargCue(definition)).toThrow();
  });
});

