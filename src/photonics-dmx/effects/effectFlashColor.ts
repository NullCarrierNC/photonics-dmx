import { Effect, RGBIO, WaitCondition } from "../types";
import { IEffect } from "./interfaces/IEffect";
import { EasingType } from "../easing";

/**
 * Interface for flash colour effect parameters, extending the base effect interface
 */
interface FlashColorEffectParams extends IEffect {
    /** The colour to flash to */
    color: RGBIO;
    /** The condition that triggers the start of the flash */
    startTrigger: WaitCondition;
    /** Time to wait before starting the flash */
    startWait?: number;
    /** The condition that triggers the end of the flash */
    endTrigger?: WaitCondition;
    /** Time to wait before ending the flash */
    endWait?: number;
    /** Time to hold the flash colour */
    holdTime: number;
    /** Duration of the fade in */
    durationIn: number;
    /** Duration of the fade out */
    durationOut: number;
}

export const getEffectFlashColor = ({
    color,
    startTrigger,
    startWait = 0,
    endTrigger = 'none',
    endWait = 0,
    durationIn,
    holdTime,
    durationOut,
    lights,
    layer = 0,
    easing = EasingType.SIN_OUT
}: FlashColorEffectParams): Effect => {
    const effect: Effect = {
        id: "flash-color",
        description: "Sets the light a colour then quickly fades it out",
        transitions: [
            {
                lights: lights,
                layer: layer,
                waitForCondition: startTrigger,
                waitForTime: startWait,
                transform: {
                    color: color,
                    easing: easing,
                    duration: durationIn,
                },
                waitUntilCondition: "delay",
                waitUntilTime: holdTime,
            },
            {
                lights: lights,
                layer: layer,
                waitForCondition: endTrigger,
                waitForTime: endWait,
                transform: {
                    color: {
                        red: color.red,
                        green: color.green,
                        blue: color.blue,
                        intensity: 0,
                        opacity: 0.0,
                        blendMode: 'replace',
                    },
                    easing: easing,
                    duration: durationOut,
                },
                waitUntilCondition: "delay",
                waitUntilTime: holdTime,
            },
        ],
    };

    return effect;
};