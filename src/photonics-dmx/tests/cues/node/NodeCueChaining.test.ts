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
            effectType: 'single-color',
            target: { groups: ['front'], filter: 'all' },
            color: { name: 'red', brightness: 'medium', blendMode: 'replace' },
            timing: {
              waitForCondition: 'none',
              waitForTime: 0,
              duration: 100,
              waitUntilCondition: 'delay',
              waitUntilTime: 0,
              easing: 'linear',
              level: 1
            },
            layer: 10
          },
          {
            id: 'a2',
            type: 'action',
            effectType: 'single-color',
            target: { groups: ['back'], filter: 'all' },
            color: { name: 'blue', brightness: 'medium', blendMode: 'replace' },
            timing: {
              waitForCondition: 'none',
              waitForTime: 0,
              duration: 50,
              waitUntilCondition: 'delay',
              waitUntilTime: 0,
              easing: 'linear',
              level: 1
            },
            layer: 10
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
      return target.groups.includes('front') ? [frontLight] : [backLight];
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
