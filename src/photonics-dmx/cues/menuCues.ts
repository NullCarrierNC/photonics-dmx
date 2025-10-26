import { DmxLightManager } from "../controllers/DmxLightManager";
import { ILightingController } from "../controllers/sequencer/interfaces";
import { getEffectFlashColor } from "../effects/effectFlashColor";
import { getEffectSingleColor } from "../effects/effectSingleColor";
import { getSweepEffect } from "../effects/sweepEffect";
import { getColor } from "../helpers/dmxHelpers";
import { randomBetween } from "../helpers/utils";

import { RGBIO, TrackedLight } from "../types";




/**
 * Sets all lights to a dim blue, randomly flashing one light bright blue.
 * @param effectController 
 * @param lightManager 
 */
export function cueMenuRandomFlash(effectController: ILightingController, lightManager: DmxLightManager) {
    const lights = lightManager.getLights(['front', 'back'], 'all');

    const blueLow: RGBIO = getColor('blue', 'low');
    const blueHigh: RGBIO = getColor('blue', 'high');


    const effect = getEffectSingleColor({
        color: blueLow,
        duration: 500,
        waitUntil: 'delay',
        untilTime: 500,
        lights: lights,
        layer: 0,
    });

    const flashBlue = getEffectFlashColor({
        color: blueHigh,
        startTrigger: 'delay',
        startWait: randomBetween(500, 2000),
        lights: [lights[(randomBetween(0, (lights.length - 1)))]],
        durationIn: 500,
        holdTime: randomBetween(500, 1000),
        durationOut: 500,
        layer: 5,
    })

    effectController.addEffect("menu", effect, true);
    effectController.addEffect("menuflash", flashBlue, true);
}





export function cueMenuCircleChase(effectController: ILightingController, lightManager: DmxLightManager) {
    
    const frontLights = lightManager.getLights(['front'], 'all');
    const backLights = lightManager.getLights(['back'], 'all');

    const sortedFrontLights = frontLights.sort((a: TrackedLight, b: TrackedLight) => a.position - b.position);
    // Sort backLights by position descending
    const sortedBackLights = backLights.sort((a: TrackedLight, b: TrackedLight) => b.position - a.position);

    // Merge the sorted arrays into allLights
    const allLights = [...sortedFrontLights, ...sortedBackLights];
   
    const blue: RGBIO = getColor('blue', 'low');
    const brightBlue: RGBIO = getColor('blue', 'high');


    const sweep = getSweepEffect({
      lights: allLights,
      high: brightBlue,
      low: blue,
      sweepTime: 2000,
      fadeInDuration: 300,
      fadeOutDuration: 600,
      lightOverlap: 70,
      betweenSweepDelay: 2000,
      layer: 0,
    })
    // Use unblocked to avoid breaking the sweep timing.
    effectController.addEffectUnblockedName('menu', sweep, true);


}