import { EffectExecutionEngine } from '../../../../cues/node/runtime/EffectExecutionEngine';
import { EffectCompiler } from '../../../../cues/node/compiler/EffectCompiler';
import type { YargEffectDefinition } from '../../../../cues/types/nodeCueTypes';
import { defaultCueData, type CueData } from '../../../../cues';
import { getColor } from '../../../../helpers/dmxHelpers';
import { createSequencerHarness } from '../../../helpers/sequencerHarness';

const createCueData = (overrides: Partial<CueData> = {}): CueData => ({
  ...defaultCueData,
  beatsPerMinute: 120,
  ...overrides
});

describe('Effect runtime with real Sequencer', () => {
  let harness: ReturnType<typeof createSequencerHarness>;

  beforeEach(() => {
    harness = createSequencerHarness({ frontCount: 2, backCount: 0 });
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('maps effect parameters into action values', () => {
    const effect: YargEffectDefinition = {
      id: 'param-effect',
      mode: 'yarg',
      name: 'Param Effect',
      description: '',
      variables: [
        { name: 'colorParam', type: 'string', scope: 'cue', initialValue: 'red', isParameter: true }
      ],
      nodes: {
        events: [],
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
              name: { source: 'variable', name: 'colorParam', fallback: 'red' },
              brightness: { source: 'literal', value: 'high' },
              blendMode: { source: 'literal', value: 'replace' }
            },
            timing: {
              waitForCondition: 'none',
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 0 },
              waitUntilCondition: 'none',
              waitUntilTime: { source: 'literal', value: 0 }
            }
          }
        ],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectListeners: [
          {
            id: 'listener-1',
            type: 'effect-listener',
            label: 'Entry',
            outputs: ['action-1']
          }
        ]
      },
      connections: [{ from: 'listener-1', to: 'action-1' }],
      layout: { nodePositions: {} }
    };

    const compiledEffect = EffectCompiler.compile(effect);
    const engine = new EffectExecutionEngine(
      compiledEffect,
      harness.sequencer,
      harness.lightManager,
      { colorParam: 'green' },
      createCueData()
    );

    engine.triggerEffect(createCueData());
    harness.advanceBy(1);

    const state = harness.getLightState(harness.frontLightIds[0]);
    const expected = getColor('green', 'high');
    expect(state).toMatchObject({
      red: expected.red,
      green: expected.green,
      blue: expected.blue,
      blendMode: expected.blendMode
    });
  });

  it('uses parameterized start delay for actions', () => {
    const effect: YargEffectDefinition = {
      id: 'delay-param-effect',
      mode: 'yarg',
      name: 'Delay Param Effect',
      description: '',
      variables: [
        { name: 'startDelay', type: 'number', scope: 'cue', initialValue: 0, isParameter: true }
      ],
      nodes: {
        events: [],
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
              name: { source: 'literal', value: 'yellow' },
              brightness: { source: 'literal', value: 'high' },
              blendMode: { source: 'literal', value: 'replace' }
            },
            timing: {
              waitForCondition: 'none',
              waitForTime: { source: 'variable', name: 'startDelay', fallback: 0 },
              duration: { source: 'literal', value: 0 },
              waitUntilCondition: 'none',
              waitUntilTime: { source: 'literal', value: 0 }
            }
          }
        ],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectListeners: [
          {
            id: 'listener-1',
            type: 'effect-listener',
            label: 'Entry',
            outputs: ['action-1']
          }
        ]
      },
      connections: [{ from: 'listener-1', to: 'action-1' }],
      layout: { nodePositions: {} }
    };

    const compiledEffect = EffectCompiler.compile(effect);
    const engine = new EffectExecutionEngine(
      compiledEffect,
      harness.sequencer,
      harness.lightManager,
      { startDelay: 30 },
      createCueData()
    );

    engine.triggerEffect(createCueData());
    harness.advanceBy(1);

    const lightId = harness.frontLightIds[0];
    const beforeDelay = harness.getLightState(lightId);
    expect(beforeDelay?.intensity ?? 0).toBe(0);

    harness.advanceBy(35);
    const afterDelay = harness.getLightState(lightId);
    const expected = getColor('yellow', 'high');
    expect(afterDelay).toMatchObject({
      red: expected.red,
      green: expected.green,
      blue: expected.blue,
      blendMode: expected.blendMode
    });
  });

  it('uses parameterized duration to keep effect active', () => {
    const effect: YargEffectDefinition = {
      id: 'duration-param-effect',
      mode: 'yarg',
      name: 'Duration Param Effect',
      description: '',
      variables: [
        { name: 'fadeDuration', type: 'number', scope: 'cue', initialValue: 0, isParameter: true }
      ],
      nodes: {
        events: [],
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
              name: { source: 'literal', value: 'purple' },
              brightness: { source: 'literal', value: 'high' },
              blendMode: { source: 'literal', value: 'replace' }
            },
            timing: {
              waitForCondition: 'none',
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'variable', name: 'fadeDuration', fallback: 0 },
              waitUntilCondition: 'none',
              waitUntilTime: { source: 'literal', value: 0 }
            }
          }
        ],
        logic: [],
        eventRaisers: [],
        eventListeners: [],
        effectListeners: [
          {
            id: 'listener-1',
            type: 'effect-listener',
            label: 'Entry',
            outputs: ['action-1']
          }
        ]
      },
      connections: [{ from: 'listener-1', to: 'action-1' }],
      layout: { nodePositions: {} }
    };

    const compiledEffect = EffectCompiler.compile(effect);
    const engine = new EffectExecutionEngine(
      compiledEffect,
      harness.sequencer,
      harness.lightManager,
      { fadeDuration: 40 },
      createCueData()
    );

    engine.triggerEffect(createCueData());
    harness.advanceBy(1);

    const lightId = harness.frontLightIds[0];
    expect(harness.sequencer.getActiveEffectsForLight(lightId).has(0)).toBe(true);

    harness.advanceBy(20);
    expect(harness.sequencer.getActiveEffectsForLight(lightId).has(0)).toBe(true);

    let cleared = false;
    for (let i = 0; i < 10; i += 1) {
      harness.advanceBy(10);
      if (!harness.sequencer.getActiveEffectsForLight(lightId).has(0)) {
        cleared = true;
        break;
      }
    }
    expect(cleared).toBe(true);
  });

  it('blocks execution through effect delay nodes', async () => {
    const effect: YargEffectDefinition = {
      id: 'delay-effect',
      mode: 'yarg',
      name: 'Delay Effect',
      description: '',
      nodes: {
        events: [],
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
              blendMode: { source: 'literal', value: 'replace' }
            },
            timing: {
              waitForCondition: 'none',
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 0 },
              waitUntilCondition: 'none',
              waitUntilTime: { source: 'literal', value: 0 }
            }
          }
        ],
        logic: [
          {
            id: 'delay-1',
            type: 'logic',
            logicType: 'delay',
            delayTime: { source: 'literal', value: 20 }
          }
        ],
        eventRaisers: [],
        eventListeners: [],
        effectListeners: [
          {
            id: 'listener-1',
            type: 'effect-listener',
            label: 'Entry',
            outputs: ['delay-1']
          }
        ]
      },
      connections: [
        { from: 'listener-1', to: 'delay-1' },
        { from: 'delay-1', to: 'action-1' }
      ],
      layout: { nodePositions: {} }
    };

    const compiledEffect = EffectCompiler.compile(effect);
    const engine = new EffectExecutionEngine(
      compiledEffect,
      harness.sequencer,
      harness.lightManager,
      {},
      createCueData()
    );

    engine.triggerEffect(createCueData());
    harness.advanceBy(1);

    const lightId = harness.frontLightIds[0];
    const beforeDelay = harness.getLightState(lightId);
    expect(beforeDelay?.intensity ?? 0).toBe(0);

    jest.advanceTimersByTime(25);
    harness.advanceBy(1);

    const afterDelay = harness.getLightState(lightId);
    const expected = getColor('red', 'high');
    expect(afterDelay).toMatchObject({
      red: expected.red,
      green: expected.green,
      blue: expected.blue,
      blendMode: expected.blendMode
    });
  });

  it('raises internal events to drive effect actions', () => {
    const effect: YargEffectDefinition = {
      id: 'event-effect',
      mode: 'yarg',
      name: 'Event Effect',
      description: '',
      events: [{ name: 'internal', description: '' }],
      nodes: {
        events: [],
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
              brightness: { source: 'literal', value: 'high' },
              blendMode: { source: 'literal', value: 'replace' }
            },
            timing: {
              waitForCondition: 'none',
              waitForTime: { source: 'literal', value: 0 },
              duration: { source: 'literal', value: 0 },
              waitUntilCondition: 'none',
              waitUntilTime: { source: 'literal', value: 0 }
            }
          }
        ],
        logic: [],
        eventRaisers: [
          {
            id: 'raiser-1',
            type: 'event-raiser',
            eventName: 'internal',
            label: 'Raise',
            inputs: [],
            outputs: []
          }
        ],
        eventListeners: [
          {
            id: 'listener-event-1',
            type: 'event-listener',
            eventName: 'internal',
            label: 'Listen',
            outputs: ['action-1']
          }
        ],
        effectListeners: [
          {
            id: 'listener-1',
            type: 'effect-listener',
            label: 'Entry',
            outputs: ['raiser-1']
          }
        ]
      },
      connections: [
        { from: 'listener-1', to: 'raiser-1' },
        { from: 'listener-event-1', to: 'action-1' }
      ],
      layout: { nodePositions: {} }
    };

    const compiledEffect = EffectCompiler.compile(effect);
    const engine = new EffectExecutionEngine(
      compiledEffect,
      harness.sequencer,
      harness.lightManager,
      {},
      createCueData()
    );

    engine.triggerEffect(createCueData());
    harness.advanceBy(1);

    const state = harness.getLightState(harness.frontLightIds[0]);
    const expected = getColor('blue', 'high');
    expect(state).toMatchObject({
      red: expected.red,
      green: expected.green,
      blue: expected.blue,
      blendMode: expected.blendMode
    });
  });
});
