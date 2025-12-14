import { NodeCueCompiler } from '../../../cues/node/compiler/NodeCueCompiler';
import { YargNodeCue } from '../../../cues/node/runtime/YargNodeCue';
import { ActionEffectFactory } from '../../../cues/node/compiler/ActionEffectFactory';
import { YargNodeCueDefinition } from '../../../cues/types/nodeCueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { CueType } from '../../../cues/types/cueTypes';
import { Effect, TrackedLight } from '../../../types';

describe('Node cue chaining', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('executes actions sequentially with execution engine', async () => {
    const definition: YargNodeCueDefinition = {
      id: 'test-cue',
      name: 'Chained Beat',
      description: '',
      cueType: CueType.Cool_Automatic,
      style: 'primary',
      nodes: {
        events: [
          { id: 'e1', type: 'event', eventType: 'beat' }
        ],
        actions: [
          {
            id: 'a1',
            type: 'action',
            effectType: 'set-color',
            target: { 
              groups: { source: 'literal', value: 'front' }, 
              filter: { source: 'literal', value: 'all' } 
            },
            color: { 
              name: { source: 'literal', value: 'red' }, 
              brightness: { source: 'literal', value: 'medium' }, 
              blendMode: { source: 'literal', value: 'replace' } 
            },
            timing: {
              waitForCondition: 'none',
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 100 },
              waitUntilCondition: 'delay',
              waitUntilTime: { source: 'literal', value: 0 },
              easing: 'linear',
              level: { source: 'literal', value: 1 }
            },
            layer: { source: 'literal', value: 10 }
          },
          {
            id: 'a2',
            type: 'action',
            effectType: 'set-color',
            target: { 
              groups: { source: 'literal', value: 'back' }, 
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
              duration: { source: 'literal', value: 50 },
              waitUntilCondition: 'delay',
              waitUntilTime: { source: 'literal', value: 0 },
              easing: 'linear',
              level: { source: 'literal', value: 1 }
            },
            layer: { source: 'literal', value: 10 }
          }
        ]
      },
      connections: [
        { from: 'e1', to: 'a1' },
        { from: 'a1', to: 'a2' }
      ]
    };

    const compiled = NodeCueCompiler.compileYargCue(definition);
    const cue = new YargNodeCue('group-1', compiled);

    const frontLight: TrackedLight = { id: 'front-1', position: 0 };
    const backLight: TrackedLight = { id: 'back-1', position: 1 };

    jest.spyOn(ActionEffectFactory, 'resolveLights').mockImplementation((_lm, target) => {
      // Handle ValueSource structure - target.groups is { source: 'literal', value: 'front' }
      const groupsValue = target.groups?.source === 'literal' ? target.groups.value : '';
      return groupsValue.includes('front') ? [frontLight] : [backLight];
    });

    const callOrder: string[] = [];
    const sequencerMock: Partial<ILightingController> = {
      addEffectWithCallback: (name: string, _effect: Effect, onComplete: () => void) => {
        callOrder.push(name);
        // Call callback immediately to simulate completion
        onComplete();
      }
    };

    await cue.execute({ beat: 'Strong' } as any, sequencerMock as ILightingController, null as any);

    // Verify both actions were executed in order
    expect(callOrder.length).toBe(2);
    expect(callOrder[0]).toContain('a1');
    expect(callOrder[1]).toContain('a2');
  });
});
