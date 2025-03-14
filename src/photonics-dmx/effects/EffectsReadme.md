# Effects

This is another area in the code that could use some cleanup... right now the define effects
are all using their own interfaces with little standarization.


## Definition:

Effects are comprised of a group of transitions, which are arrays of 
transforms that are applied to the lights. 
E.g. cross-fading from one colour to another would include two transforms.
One for your starting state, the other for your end state:

```Typescript
 const effect: Effect = {
        id: "cross-fade-colors",
        description: "Cross-fades light from one color to another.",
        transitions: [
            {
                lights: lights,
                layer: layer,
                waitFor: waitFor,
                forTime: afterStartWait,
                transform: {
                    color: startColor,
                    easing: easing,
                    duration: duration,
                },
                waitUntil: crossFadeTrigger,
                untilTime: 0
            },
            {
                lights: lights,
                layer: layer,
                waitFor: 'delay',
                forTime: afterEndColorWait,
                transform: {
                    color: endColor,
                    easing: easing,
                    duration: duration,
                },
                waitUntil: crossFadeTrigger,
                untilTime: 0
            },
        ]
    };
```


