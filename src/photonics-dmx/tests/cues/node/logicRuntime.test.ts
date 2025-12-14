import { YargNodeCue } from '../../../cues/node/runtime/YargNodeCue';
import { NodeCueCompiler } from '../../../cues/node/compiler/NodeCueCompiler';
import { CueType } from '../../../cues/types/cueTypes';
import type { YargNodeCueDefinition } from '../../../cues/types/nodeCueTypes';
import { ActionEffectFactory } from '../../../cues/node/compiler/ActionEffectFactory';

describe('Node cue logic runtime', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('branches through conditional logic and clamps divide-by-zero', async () => {
    const definition: YargNodeCueDefinition = {
      id: 'logic-cue',
      name: 'Logic Cue',
      cueType: CueType.Chorus,
      style: 'primary',
      nodes: {
        events: [
          { id: 'event-1', type: 'event', eventType: 'beat' }
        ],
        actions: [
          {
            id: 'action-true',
            type: 'action',
            effectType: 'single-color',
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
          },
          {
            id: 'action-false',
            type: 'action',
            effectType: 'single-color',
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
              waitUntilCondition: 'none',
              waitUntilTime: { source: 'literal', value: 0 },
              easing: 'sinInOut',
              level: { source: 'literal', value: 1 }
            }
          }
        ],
        logic: [
          {
            id: 'math-1',
            type: 'logic',
            logicType: 'math',
            operator: 'divide',
            left: { source: 'literal', value: 10 },
            right: { source: 'literal', value: 0 },
            assignTo: 'calc'
          },
          {
            id: 'cond-1',
            type: 'logic',
            logicType: 'conditional',
            comparator: '==',
            left: { source: 'variable', name: 'calc', fallback: 0 },
            right: { source: 'literal', value: 0 }
          }
        ]
      },
      connections: [
        { from: 'event-1', to: 'math-1' },
        { from: 'math-1', to: 'cond-1' },
        { from: 'cond-1', to: 'action-true', fromPort: 'true' },
        { from: 'cond-1', to: 'action-false', fromPort: 'false' }
      ],
      layout: { nodePositions: {} }
    };

    const compiled = NodeCueCompiler.compileYargCue(definition);
    const cue = new YargNodeCue('group-1', compiled);

    const addEffectWithCallback = jest.fn((_name: string, _effect: any, onComplete: () => void) => {
      // Call callback immediately to simulate completion
      onComplete();
    });
    
    const sequencer = { 
      addEffectWithCallback
    } as any;
    
    const lightManager = { getLights: jest.fn().mockReturnValue([{ id: 'l1', position: 0 }]) } as any;

    jest.spyOn(ActionEffectFactory, 'resolveLights').mockReturnValue([{ id: 'l1', position: 0 } as any]);
    const buildEffectSpy = jest.spyOn(ActionEffectFactory, 'buildEffect').mockImplementation(({ action, waitTime }) => ({
      id: action.id,
      description: 'mock',
      transitions: [
        {
          lights: [],
          layer: action.layer ?? 0,
          waitForCondition: 'none',
          waitForTime: waitTime ?? 0,
          transform: {
            color: { red: 0, green: 0, blue: 0, intensity: 0, opacity: 1, blendMode: 'replace' },
            easing: 'sin.in',
            duration: action.timing.duration
          },
          waitUntilCondition: 'none',
          waitUntilTime: 0
        }
      ]
    }) as any);

    await cue.execute({ beat: 'Strong' } as any, sequencer, lightManager);

    // Verify the conditional logic evaluated correctly (10/0 = 0, 0 == 0 is true)
    expect(buildEffectSpy).toHaveBeenCalledWith(expect.objectContaining({ action: expect.objectContaining({ id: 'action-true' }) }));
    expect(buildEffectSpy).not.toHaveBeenCalledWith(expect.objectContaining({ action: expect.objectContaining({ id: 'action-false' }) }));
    expect(addEffectWithCallback).toHaveBeenCalledTimes(1);
  });
});
