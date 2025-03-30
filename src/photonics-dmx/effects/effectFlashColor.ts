import { Effect, RGBIP, WaitCondition } from "../types";
import { IEffect } from "./interfaces/IEffect";
import { EasingType } from "../easing";

/**
 * Interface for flash colour effect parameters, extending the base effect interface
 */
interface FlashColorEffectParams extends IEffect {
    /** The colour to flash to */
    color: RGBIP;
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
        description: "Sets the light a colour then quickly fades it out with P",
        transitions: [
            {
                lights: lights,
                layer: layer,
                waitFor: startTrigger,
                forTime: startWait,
                transform: {
                    color: color,
                    easing: easing,
                    duration: durationIn,
                },
                waitUntil: "delay",
                untilTime: holdTime,
            },
            {
                lights: lights,
                layer: layer,
                waitFor: endTrigger,
                forTime: endWait,
                transform: {
                    color: {
                        red: 0,
                        rp: 0,
                        green: 0,
                        gp: 0,
                        blue: 0,
                        bp: 0,
                        intensity: 0,
                        ip: 0,
                    },
                    easing: easing,
                    duration: durationOut,
                },
                waitUntil: "delay",
                untilTime: holdTime,
            },
        ],
    };

    return effect;
};