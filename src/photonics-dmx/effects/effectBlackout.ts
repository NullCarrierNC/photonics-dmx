import { Effect, RGBIP } from "../types";
import { EasingType } from "../easing";
import { IEffect } from "./interfaces/IEffect";

/**
 * Interface for blackout effect parameters, extending the base effect interface
 */
interface BlackoutEffectParams extends IEffect {
    /** Duration of the blackout transition */
    duration: number;
}

export const getEffectBlackout = ({
    duration,
    lights,
    layer = 0,
    easing = EasingType.SIN_OUT,
}: BlackoutEffectParams): Effect => {
    const black: RGBIP = {
        red: 0,
        rp: 255,
        green: 0,
        gp: 255,
        blue: 0,
        bp: 255,
        intensity: 0,
        ip: 255,
    };

    const blackoutEffect: Effect = {
        id: "blackout",
        description: "Turns off all lights",
        transitions: [
            {
                lights: lights,
                layer: layer,
                waitFor: "none",
                forTime: 0,
                transform: {
                    color: black,
                    easing: easing,
                    duration: duration,
                },
                waitUntil: "none",
                untilTime: 0,
            },
        ],
    };

    return blackoutEffect;
};