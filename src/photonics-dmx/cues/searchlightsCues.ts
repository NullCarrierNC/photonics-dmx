import { DmxLightManager } from "../controllers/DmxLightManager";
import { ILightingController } from "../controllers/sequencer/interfaces";

import { getSweepEffect } from "../effects/sweepEffect";

import { getColor } from "../helpers/dmxHelpers";
import { randomBetween } from "../helpers/utils";
import { RGBIP, TrackedLight } from "../types";

var ltr = true;

export function cueSearchlightsChase(effectController: ILightingController, lightManager: DmxLightManager) {
    const frontLights = lightManager.getLights(['front'], 'all');
    const backLights = lightManager.getLights(['back'], 'all');

    const sortedFrontLights = frontLights.sort((a: TrackedLight, b: TrackedLight) => a.position - b.position);
    const sortedBackLights = backLights.sort((a: TrackedLight, b: TrackedLight) => b.position - a.position);

    const allLights = [...sortedFrontLights, ...sortedBackLights];
   
    if (! ltr){
        allLights.reverse();
    }

    const transparent: RGBIP = getColor('transparent', 'low');
    const highRed = getColor('red', 'high');
    const highGreen = getColor('green', 'high');
    const highBlue = getColor('blue', 'high');
    const highWhite = getColor('white', 'high');

    const colors = [highBlue, highGreen, highRed, highWhite]
    const idx = randomBetween(0, colors.length-1);
    const colour = colors[idx];


    const sweep = getSweepEffect({
      lights: allLights,
      high: colour,
      low: transparent,
      sweepTime: 2000,
      fadeInDuration: 300,
      fadeOutDuration: 600,
      lightOverlap: 70,
      layer: 101,
      //  waitFor: "beat",
    })
    // Use unblocked to avoid breaking the sweep timing.
    const didAdd = effectController.addEffectUnblockedName('searchlights', sweep);
    if (didAdd){
        ltr = !ltr;
    }
}


