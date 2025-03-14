# Photonics - DMX Sequencer for YARG & RB3E

Photonics is a purpose built DMX sequencer for use with YARG and Rock Band 3 Enhanced. 
It uses in-game lighting data to drive DMX lights in time to the music.

It utilizes a library of built in lighting cues to create as close to a plug-and-play DMX experience as possible. 
If you’re interested in using DMX lights, but don’t want to create all the lighting cues yourself in applications 
like LightJams or QLC+, it might be the solution for you.

It sits somewhere between the original Rock Band Stage Kit and full blown DMX controllers like Lightjams and QLC+. 
Cue handling differs from YALCY, and unlike YALCY Photonics *only* supports DMX lights.

For more information or the Quickstart guide please visit the project site: [Photonics.rocks](https://photonics.rocks)


## Before You Begin…

If this is your first foray into real-world lighting for rhythm games, and you primarily use YARG, 
you may wish to first take a look at the [YALCY](https://github.com/YARC-Official/YALCY) project.

YALCY is Yet Another Lighting Controller for YARG, and is the official way of integrating lighting effects with YARG. 
When used with the [FatsCo Light Show](https://www.ebay.ca/itm/116393720295) and [Strobe Light](https://www.ebay.ca/itm/116073118989), 
this is by far the easiest way to get up and running!


## Downloading and Playing

Grab the release for your OS and install. For YARG you can run Photonics on the same computer as YARG. 

Please take a look at the [Quickstart Guide](https://photonics.rocks/quickstart-guide/) for instructions on getting up and running.


## Status

Photonics is still very much in its early Alpha stages. It's usable, but you can expect bugs and possibly breaking changes down the road. 
The current library of effects is limited, with only one set of effects per lighting cue. 
This can get a bit repetative over time - we're working on it!

See the [Project Status](https://photonics.rocks/project-status/) for more details.



## License

Photonics is licenced under the [GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html) (or later). See the LICENCE file for details.


### External Licences

Some libraries/assets are packaged with the source code have licenses that must be included.

| Link        | Licence     | Use         |
| ----------- | ----------- | ----------- |
| [sACN](https://github.com/k-yle/sACN) | Apache-2.0 license | sACN Output |
| [dmx-ts](https://github.com/node-dmx/dmx-ts)   | MIT license | Enttec Pro USB |



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
# NOTE: The build will compile and run, but the app will not be able to receive 
# the network events sent from YARG or RB3E. I have not dug into this yet...
$ npm run build:mac

# For Linux - completely untested to-date!
$ npm run build:linux
```
