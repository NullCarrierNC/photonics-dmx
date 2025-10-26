# Photonics - DMX Sequencer for YARG & Rock Band 3 (Enhanced)

Photonics is a purpose built DMX light sequencer for use with YARG and Rock Band 3 Enhanced. 
It uses in-game lighting data to drive DMX lights in time to the music.

It utilizes a library of built in lighting cues to create as close to a plug-and-play DMX experience as possible. 
If you're interested in using DMX lights, but don't want to create all the lighting cues yourself in applications 
like LightJams or QLC+, it might be the solution for you.

It sits somewhere between the original Rock Band Stage Kit and full blown DMX controllers like Lightjams and QLC+. 
Unlike YALCY Photonics *only* supports DMX lights and has support for Rock Band 3 (Enhanced).

For more information or the Quickstart guide please visit the project site: [Photonics.rocks](https://photonics.rocks)


## Updating from Alpha 1

Alpha 2 brings a lot of new functionality to Photonics, but it also brought a breaking change:

### Light Layout order: 

Previously the lights were ordered _ascending_ on the front and back lights. E.g.:

Font: 1, 2, 3, 4

Back: 5, 6, 7, 8


The back order has changed to _descending_. E.g.: 

Font: 1, 2, 3, 4

Back: **8, 7, 6, 5**


This better reflects the linear progression of sweep style effects that loop around the front and back lights.
You will have to update your _Light Layout_ configuration to correctly order your physical DMX lights.

If you have problems feel free to reach out in our [Discord Server](https://discord.gg/2Vyqc2hYcK).


## Before You Begin…

If this is your first foray into real-world lighting for rhythm games, and you primarily use YARG, 
you may wish to first take a look at the [YALCY](https://github.com/YARC-Official/YALCY) project.

YALCY is Yet Another Lighting Controller for YARG, and is the official way of integrating lighting effects with YARG. 
When used with the [FatsCo Light Show](https://www.ebay.ca/itm/116393720295) and [Strobe Light](https://www.ebay.ca/itm/116073118989), 
this is by far the easiest way to get up and running!


## YARG vs. Rock Band 3 (Enhanced)

How Photonics works is a bit different between the games:

`YARG`: Uses the same YARG data stream and cue triggers as YALCY. Currently you need the Nightly version of YARG to enable this feature. 
See the [Quickstart Guide](https://photonics.rocks/quickstart-guide/) for more on setting up YARG.

YARG supports multiple banks of cues (the visual effects): `Stage Kit` mimmics the original Stage Kit effects. Additional cue banks provide 
alternative interpretations of these cues - they're inspired by, but do not match, the original Stage Kit. They tend to be less frenetic 
than the original effects.

You can enable/disable the banks you like.



`Rock Band 3 Enhanced`: You need to edit the `rb3e.ini` configuration file to enable the lighting data over the network. Unlike YARG, RB3E 
specifies the specific colours of each of the LEDs found on the original Stage Kit. Photonics maps this data against the available DMX lights 
in your rig - using colour blending when two or more Stage Kit colour banks enable the same LED. E.g. Green 1 and Blue 1 on the Stage Kit 
will become Cyan on DMX Light 1.

** If you are running RB3E you will need either 4 or 8 DMX lights ** - other combinations are unsupported.



## Downloading and Playing

Grab the release for your OS and install. For YARG you can run Photonics on the same computer as YARG. 

Please take a look at the [Quickstart Guide](https://photonics.rocks/quickstart-guide/) for instructions on getting up and running.


## Status

Photonics is still in its Alpha stages. The current release is Alpha 2 and has come a long way from Alpha 1. 
That said, there's more to come and the possibility of breaking changes ahead...

See the [Project Status](https://photonics.rocks/project-status/) for more details.



## License

Photonics is licensed under the [GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html) (or later). See the LICENSE file for details.


### External Licenses

Some libraries/assets that are packaged with the source code have licenses that must be included.

| Link        | License     | Use         |
| ----------- | ----------- | ----------- |
| [dmx-ts](https://github.com/node-dmx/dmx-ts)   | MIT license | ArtNet and Enttec Pro USB Support |
| [sacn](https://github.com/node-dmx/sacn)   | MIT license | sACN DMX over network |
| [@electron-toolkit/preload](https://github.com/alex8088/electron-toolkit)   | MIT license | Electron preload utilities |
| [@electron-toolkit/utils](https://github.com/alex8088/electron-toolkit)   | MIT license | Electron utilities |
| [jotai](https://github.com/pmndrs/jotai)   | MIT license | State Management |
| [react-icons](https://github.com/react-icons/react-icons)   | MIT license | UI Icons |
| [date-fns](https://github.com/date-fns/date-fns)   | MIT license | Date Formatting and Manipulation |
| [uuid](https://github.com/uuidjs/uuid)   | MIT license | UUID Generation |



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

### Running Tests

```bash
# Run all tests
$ npm test

# Run tests in watch mode (automatically re-run tests when code changes)
$ npm run test:watch

# Run tests with code coverage
$ npm run test:coverage
```
