# Photonics - DMX Sequencer for YARG, Rock Band 3 (Enhanced), and Music Visualization

[![Photonics DMX demo](https://img.youtube.com/vi/RNMgnqftDfw/maxresdefault.jpg)](https://www.youtube.com/@PhotonicsDMX)

Photonics is a purpose built DMX light sequencer / controller for use with YARG, Rock Band 3 Enhanced, or as a music visualizer.
It uses in-game lighting data, or audio analysis, to drive DMX lights in time to the music.

It comes with a library of built-in lighting cues to create as close to a plug-and-play DMX experience as possible. 
For power users, there is also a cue editor for creating your own lighting effects.

If you're interested in using DMX lights, but don't necessarily want to create all the lighting cues yourself in applications
like LightJams or QLC+, and want something larger than the Rock Band Stage Kit, it could be the solution for you!

For more information or the Quickstart guide, please visit the project site: [Photonics.rocks](https://photonics.rocks)

If you have questions, feel free to reach out in our [Discord Server](https://discord.gg/2Vyqc2hYcK).


## DMX Output

Photonics support DMX output over sACN, ArtNet, Enttec Pro USB, OpenDMX (FTDI), plus a live 2D & 3D DMX preview in the app.

If you don't have the hardware already, we recommend you look at sACN network adapters over USB based solutions.


### Mac Users:

You can now download a build for MacOS. If you try to run it and get an error message: 
`“Photonics” is damaged and can’t be opened. You should move it to the Trash.`

This is Gatekeeper blocking the app because it's not currently signed. To bypass this warning you need to open your terminal and run:
`xattr -r -d com.apple.quarantine /Applications/Photonics.app`

This should only need to be done once. After running that try opening Photonics again normally.



## Before You Begin…

If this is your first foray into real-world lighting for rhythm games, and you primarily use YARG, you may want to first take a look at the [YALCY](https://github.com/YARC-Official/YALCY) project.

YALCY is Yet Another Lighting Controller for YARG, and is the official way of integrating lighting effects with YARG.
When used with the [FatsCo Light Show and Strobe Light](https://fatsco.tech/), this is by far the easiest way to get up and running.

If you're ready to move up to larger, theatre style stage lighting, then read on!


## YARG vs. Rock Band 3 (Enhanced)

How Photonics works is a bit different between the games:

### YARG:

Uses the same YARG UDP data stream and cue triggers as YALCY. You will need to enable the `UDP Data Stream` in `Settings > All Settings > Experimental`. See the [Quickstart Guide](https://photonics.rocks/quickstart-guide/) for more on setting up YARG.

YARG supports multiple banks of cues (the visual effects): `Stage Kit` mimmics the original Stage Kit effects. Additional cue banks provide alternative interpretations of these cues - they're inspired by, but do not match, the original Stage Kit. 

As the project evolves more cue groups will be added, creating a growing library of visual effects to keep your lightshows interesting!

You can enable/disable the individual banks and cues you like.


### Rock Band 3:

You will need to be running Rock Band 3 Enhanced to use Photonics. Stock RB3 does not send the necessary lighting data over the network. 

Before you start playing, you will need to edit the `rb3e.ini` configuration file to enable lighting data over the network. 

Unlike YARG, RB3E specifies the specific colours of each of the LEDs found on the original Stage Kit. Photonics maps this data against the available DMX lights in your rig - using colour blending when two or more Stage Kit colour banks enable the same LED. E.g. Green 1 and Blue 1 on the Stage Kit will become Cyan on DMX Light 1.

** If you are running RB3E you will need either 4 or 8 DMX lights ** - other combinations are unsupported.


## Music Visualization

Photonics includes audio-reactive cues, acting as a visualizer for music coming from any audio source. This feature is aimed towards visualizing for rhythm games not directly supported (eg. Clone Hero, Frets on Fire, etc), but can also be used as a general purpose music visualizer.

There are two primary audio modes: Manual and Game. Manual will only run the specific lighting cue you select, good if you just want a specific cue running while listening to music. Game will automatically select different cues and change them on the beat. No two play throughs are exactly the same!


## Cue Editor

Create your own cues for YARG or Music Visualization. Photonics includes a powerful node-based cue editor. 
Please see or [Discord Server](https://discord.gg/2Vyqc2hYcK) or [Photonics.rocks](https://photonics.rocks) for more information on how to use this feature.


## DMX Fixture Support

Photonics supports all DMX lights that use discreet colour channels, such as common RGB PAR lights. Lights with additional colour channels, such as Orange, Yellow, etc, can be used - but those specific channels won't be used today.

**Gobo (colour wheel) based lights are NOT supported.**



### Moving Head Support

Photonics also support moving head lights, specifically those that provide pan and tilt capabilities. These add an extra dimension to the light show!


## Got a Funky DMX Fixture?

There is an almost inifinte number of variations and unusual DMX lights. While Photonics won't support all of their possible features directly, they are almost always still usable with Photonics. They may look a little different, but still create an enjoyable light show.

Moving Heads that spin in circles will be the most challenging to implement. You can either use them without motion as regular lights,  or try setting up their motion capabilities. Photonics assumes discreet pan and tilt, so the results may be somewhat unpredictable, but  may be worth trying.



## Downloading and Playing

Grab the release for your OS and install. For YARG you can run Photonics on the same computer as YARG.

Please take a look at the [Quickstart Guide](https://photonics.rocks/quickstart-guide/) for instructions on getting up and running.



## Upgrading from Previous Versions

Alpha 5 introduces a new light layout, `stacked`. This is for lights mounted on a truss or T-bar where some may be up-firing while others are down-firing.

On your first run double-check your light layout, and if necessary, update it to better match your physical layout.

The only time a mismatch between the light layout and your real lights can become an issue is with moving heads: inverted (down-firing) lights need to interpret the motion data differently than up-firing. If this is not accounted for, your lights may aim right when you expect them to aim left, etc.

If you have regular, non-moving PAR or spot style lights, these will only look incorrect in the 3D preview if not setup correctly.




## Status

Photonics is still in its Alpha stages. If you run into any bugs or issues please let us know!

See the [Project Status](https://photonics.rocks/project-status/) for more details.


## License

Photonics is licensed under the [GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html) (or later). See the LICENSE file for details.

### External Licenses

Some libraries/assets that are packaged with the source code have licenses that must be included.

| Link                                                                      | License     | Use                                  |
| ------------------------------------------------------------------------- | ----------- | ------------------------------------ |
| [dmx-ts](https://github.com/node-dmx/dmx-ts)                              | MIT license | ArtNet and Enttec Pro USB Support    |
| [sacn](https://github.com/node-dmx/sacn)                                  | MIT license | sACN DMX over network                |
| [@electron-toolkit/preload](https://github.com/alex8088/electron-toolkit) | MIT license | Electron preload utilities           |
| [@electron-toolkit/utils](https://github.com/alex8088/electron-toolkit)   | MIT license | Electron utilities                   |
| [jotai](https://github.com/pmndrs/jotai)                                  | MIT license | State Management                     |
| [reactflow](https://github.com/xyflow/xyflow)                             | MIT license | Node-based cue editor UI             |
| [ajv](https://github.com/ajv-validator/ajv)                               | MIT license | JSON schema validation for node cues |
| [ajv-formats](https://github.com/ajv-validator/ajv-formats)               | MIT license | AJV format extensions                |
| [chokidar](https://github.com/paulmillr/chokidar)                         | MIT license | File watching for cue hot-reload     |
| [react-icons](https://github.com/react-icons/react-icons)                 | MIT license | UI Icons                             |
| [date-fns](https://github.com/date-fns/date-fns)                          | MIT license | Date Formatting and Manipulation     |
| [uuid](https://github.com/uuidjs/uuid)                                    | MIT license | UUID Generation                      |

## Building it Yourself

Photonics is built with [Electron-Vite](https://electron-vite.org/).

To build it yourself, clone the Git repo at: https://github.com/NullCarrierNC/photonics-dmx.git

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux - completely untested to-date!
$ npm run build:linux
```

### Lint and Type Check

```bash
$ npm run lint
# CI uses read-only lint (no --fix)
$ npm run lint:check
$ npm run typecheck
```

### Running Tests

```bash
# Run all tests
$ npm test

# Run tests in watch mode (automatically re-run tests when code changes)
$ npm run test:watch

# Run tests with code coverage
$ npm run test:coverage
```
