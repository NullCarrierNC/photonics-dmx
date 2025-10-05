# Photonics - DMX Sequencer for YARG & RB3E

Photonics is a purpose built DMX light sequencer for use with YARG and Rock Band 3 Enhanced. 
It uses in-game lighting data to drive DMX lights in time to the music.

It utilizes a library of built in lighting cues to create as close to a plug-and-play DMX experience as possible. 
If you're interested in using DMX lights, but don't want to create all the lighting cues yourself in applications 
like LightJams or QLC+, it might be the solution for you.

It sits somewhere between the original Rock Band Stage Kit and full blown DMX controllers like Lightjams and QLC+. 
Unlike YALCY Photonics *only* supports DMX lights and has support for Rock Band 3 (Enhanced).

For more information or the Quickstart guide please visit the project site: [Photonics.rocks](https://photonics.rocks)


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

Photonics is still very much in its early Alpha stages. It's quite usable, but you can expect bugs and possibly breaking changes down the road. 

See the [Project Status](https://photonics.rocks/project-status/) for more details.



## License

Photonics is licenced under the [GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html) (or later). See the LICENCE file for details.


### External Licences

Some libraries/assets are packaged with the source code have licenses that must be included.

| Link        | Licence     | Use         |
| ----------- | ----------- | ----------- |
| [dmx-ts](https://github.com/node-dmx/dmx-ts)   | MIT license | sACN, ArtNet, and Enttec Pro USB Support |



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
