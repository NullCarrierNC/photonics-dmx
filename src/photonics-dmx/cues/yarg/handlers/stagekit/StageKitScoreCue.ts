import { ICue, CueStyle } from '../../../interfaces/ICue';
import { CueData, CueType } from '../../../cueTypes';
import { ILightingController } from '../../../../controllers/sequencer/interfaces';
import { DmxLightManager } from '../../../../controllers/DmxLightManager';
import { getColor } from '../../../../helpers/dmxHelpers';
import { getSweepEffect } from '../../../../effects/sweepEffect';

/**
 * StageKit Score Cue - Yellow clockwise rotation + Blue counter-clockwise rotation
 */
export class StageKitScoreCue implements ICue {
  id = 'stagekit-score';
  cueId = CueType.Score;
  description = 'Sweep-based: Yellow clockwise rotation (1000ms) + Blue counter-clockwise rotation (200ms)';
  style = CueStyle.Primary;


  async execute(_cueData: CueData, controller: ILightingController, lightManager: DmxLightManager): Promise<void> {
    const allLights = lightManager.getLights(['front', 'back'], 'all');
    const yellowColor = getColor('yellow', 'medium', 'add');
    const blueColor = getColor('blue', 'medium', 'add');
    const transparentColor = getColor('transparent', 'medium', 'add');

    // Yellow: Clockwise rotation using sweep (1000ms per step)
    const yellowSweep = this.createYellowClockwiseSweep(allLights, yellowColor, transparentColor);
    
    // Blue: Counter-clockwise rotation using sweep (200ms per step)
    const blueSweep = this.createBlueCounterClockwiseSweep(allLights, blueColor, transparentColor);

    // Use addEffectUnblockedName for reliable looping
    await  controller.setEffect('stagekit-score-yellow', yellowSweep, true);
    await controller.addEffect('stagekit-score-blue', blueSweep, true);
  }

  private createYellowClockwiseSweep(allLights: any[], yellowColor: any, transparentColor: any) {
    // For 6+ lights, use opposite pairs; otherwise individual lights
    const shouldUsePairs = allLights.length >= 6;
    const lightGroups = shouldUsePairs ? this.createOppositePairs(allLights) : allLights;
    const stepTime = 500; 
    const totalSweepTime = lightGroups.length * stepTime;

    return getSweepEffect({
      lights: lightGroups,
      high: yellowColor,
      low: transparentColor,
      sweepTime: totalSweepTime,
      fadeInDuration: 0, // Instant on
      fadeOutDuration: 0, // Instant off  
      lightOverlap: 0, // No overlap for clean rotation
      betweenSweepDelay: 0, // Continuous looping
      layer: 1
    });
  }

  private createBlueCounterClockwiseSweep(allLights: any[], blueColor: any, transparentColor: any) {
    // Always use individual lights for blue, in reverse order for counter-clockwise
    const reversedLights = [...allLights].reverse();
    const stepTime = 200; 
    const totalSweepTime = reversedLights.length * stepTime;

    return getSweepEffect({
      lights: reversedLights,
      high: blueColor,
      low: transparentColor,
      sweepTime: totalSweepTime,
      fadeInDuration: 0, // Instant on
      fadeOutDuration: 0, // Instant off
      lightOverlap: 0, // No overlap for clean rotation
      betweenSweepDelay: 0, // Continuous looping
      layer: 20
    });
  }


  private createOppositePairs(lights: any[]): any[][] {
    const pairs: any[][] = [];
    const halfLength = Math.floor(lights.length / 2);
    
    for (let i = 0; i < halfLength; i++) {
      const first = lights[i];
      const second = lights[i + halfLength];
      pairs.push([first, second]);
    }
    
    return pairs;
  }

  onStop(): void {
    // Effect cleanup handled by effect system
  }

  onPause(): void {
    // Pause handled by effect system
  }

  onDestroy(): void {
    // Cleanup handled by effect system
  }
} 