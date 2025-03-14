import { Effect, TrackedLight, RGBIP, WaitCondition } from "../types";
import { EasingType } from "../easing";

interface GetSingleColorEffectParams {
    color: RGBIP;
    startTrigger: WaitCondition;
    startWait?: number;
    endTrigger?:WaitCondition,
    endWait?:number,
    durationIn: number;
    holdTime: number;
    durationOut: number;
    lights: TrackedLight[];
    layer?: number;
    easing?: string;
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
}: GetSingleColorEffectParams): Effect => {
    const effect: Effect = {
        id: "flash-color",
        description: "Sets the light a color then quickly fades it out with P",
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