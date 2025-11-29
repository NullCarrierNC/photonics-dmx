import { IAudioCue } from '../../interfaces/IAudioCue';
import { AudioCueData } from '../../types/audioCueTypes';
import { ILightingController } from '../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../controllers/DmxLightManager';
import { CompiledActionPlan, CompiledAudioCue } from '../compiler/NodeCueCompiler';
import { ActionEffectFactory } from '../compiler/ActionEffectFactory';
import { AudioEventNode } from '../../types/nodeCueTypes';

interface AudioEventState {
  previousValue: number;
  active: boolean;
}

interface EdgeEvaluation {
  mode: 'edge';
  triggered: boolean;
  intensity: number;
}

interface LevelEvaluation {
  mode: 'level';
  active: boolean;
  intensity: number;
}

type AudioEventEvaluation = EdgeEvaluation | LevelEvaluation;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export class AudioNodeCue implements IAudioCue {
  public readonly id: string;
  public readonly cueType: string;
  public readonly description: string;

  private readonly eventStates = new Map<string, AudioEventState>();
  private readonly activeLevelEffects = new Map<string, number>();

  constructor(groupId: string, private readonly compiledCue: CompiledAudioCue) {
    const definition = compiledCue.definition;
    this.id = `${groupId}:${definition.id}`;
    this.cueType = definition.cueTypeId;
    this.description = definition.description || definition.name || 'Node-based audio cue';
  }

  async execute(data: AudioCueData, sequencer: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    for (const plan of this.compiledCue.actions) {
      const lights = ActionEffectFactory.resolveLights(lightManager, plan.action.target);
      if (!lights.length) {
        continue;
      }

      const state = this.getEventState(plan.event.id);
      const evaluation = this.evaluateEvent(plan.event, data, state);
      const effectKey = this.effectKey(plan);
      const layer = plan.action.layer ?? 0;

      if (evaluation.mode === 'edge') {
        if (!evaluation.triggered) {
          continue;
        }

        const effect = ActionEffectFactory.buildEffect({
          action: plan.action,
          lights,
          waitCondition: 'none',
          intensityScale: evaluation.intensity
        });

        if (effect) {
          sequencer.addEffect(`${effectKey}:${Date.now()}`, effect);
        }
      } else {
        if (evaluation.active) {
          const effect = ActionEffectFactory.buildEffect({
            action: plan.action,
            lights,
            waitCondition: 'none',
            intensityScale: evaluation.intensity
          });

          if (effect) {
            tasks.push(sequencer.setEffect(effectKey, effect));
            this.activeLevelEffects.set(effectKey, layer);
          }
        } else if (this.activeLevelEffects.has(effectKey)) {
          sequencer.removeEffect(effectKey, layer);
          this.activeLevelEffects.delete(effectKey);
        }
      }
    }

    if (tasks.length) {
      await Promise.allSettled(tasks);
    }
  }

  onStop(): void {
    this.eventStates.clear();
    this.activeLevelEffects.clear();
  }

  onDestroy(): void {
    this.eventStates.clear();
    this.activeLevelEffects.clear();
  }

  private getEventState(eventId: string): AudioEventState {
    if (!this.eventStates.has(eventId)) {
      this.eventStates.set(eventId, { previousValue: 0, active: false });
    }
    return this.eventStates.get(eventId)!;
  }

  private evaluateEvent(event: AudioEventNode, data: AudioCueData, state: AudioEventState): AudioEventEvaluation {
    const threshold = clamp(event.threshold ?? 0.5, 0, 1);
    const currentValue = clamp(this.getEventValue(event.eventType, data), 0, 1);

    if (event.triggerMode === 'edge') {
      const triggered = state.previousValue < threshold && currentValue >= threshold;
      state.previousValue = currentValue;
      state.active = triggered;
      return {
        mode: 'edge',
        triggered,
        intensity: currentValue
      };
    }

    const isActive = currentValue >= threshold;
    const normalizedRange = threshold >= 1 ? 1 : (currentValue - threshold) / (1 - threshold);
    const intensity = isActive ? clamp(normalizedRange, 0.05, 1) : 0;
    state.previousValue = currentValue;
    state.active = isActive;

    return {
      mode: 'level',
      active: isActive,
      intensity
    };
  }

  private getEventValue(eventType: AudioEventNode['eventType'], data: AudioCueData): number {
    const { audioData } = data;
    switch (eventType) {
      case 'audio-beat':
        return audioData.beatDetected ? 1 : 0;
      case 'audio-energy':
        return clamp(audioData.energy ?? 0, 0, 1);
      case 'audio-range1':
        return clamp(audioData.frequencyBands.range1 ?? 0, 0, 1);
      case 'audio-range2':
        return clamp(audioData.frequencyBands.range2 ?? 0, 0, 1);
      case 'audio-range3':
        return clamp(audioData.frequencyBands.range3 ?? 0, 0, 1);
      case 'audio-range4':
        return clamp(audioData.frequencyBands.range4 ?? 0, 0, 1);
      case 'audio-range5':
        return clamp(audioData.frequencyBands.range5 ?? 0, 0, 1);
      default:
        return 0;
    }
  }

  private effectKey(plan: CompiledActionPlan<AudioEventNode>): string {
    return `${this.id}:${plan.action.id}:${plan.event.id}`;
  }
}

