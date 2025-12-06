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

  it('anchors chained steps to the triggering event across different lights', async () => {
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

    const addedEffects: Record<string, Effect> = {};
    const sequencerMock: Partial<ILightingController> = {
      addEffect: (name: string, effect: Effect) => {
        addedEffects[name] = effect;
      }
    };

    await cue.execute({} as any, sequencerMock as ILightingController, null as any);

    const [effect] = Object.values(addedEffects);
    expect(effect).toBeDefined();

    // First step uses its own waitFor (none) with no offset
    const firstStep = effect.transitions.find(t => t.lights[0].id === frontLight.id && !t.timingOnly);
    expect(firstStep?.waitForCondition).toBe('none');

    const backTransitions = effect.transitions.filter(t => t.lights[0].id === backLight.id);
    const backStep = backTransitions.find(t => !t.timingOnly);

    expect(backStep?.waitForCondition).toBe('delay');
    expect(backStep?.waitForTime).toBe(100);
    expect(backStep?.waitUntilCondition).toBe('delay');
    expect(backStep?.transform.duration).toBe(50);
  });
});
