import { atom } from 'jotai';
import { DmxFixture, LightingConfiguration,  } from '../../photonics-dmx/types';
import { Pages } from './types';

/**
 * Atom for tracking current page in navigation
 */
export const currentPageAtom = atom<Pages>(Pages.Status);

/**
 * Atom for storing available DmxLight fixture types
 */
export const dmxLightsLibraryAtom = atom<DmxFixture[]>([]);

/**
 * Atom for storing user's configured DmxLights
 */
export const myDmxLightsAtom = atom<DmxFixture[]>([]);


export const dmxLightTypesAtom = atom((get) => 
  get(dmxLightsLibraryAtom).map((DmxLight) => ({
    DmxLightType: DmxLight.fixture, 
    label: DmxLight.label, 
  }))
);



// Derived atom to sort MyDmxLightsAtom in descending alphabetical order by name
export const sortedMyDmxLightsAtom = atom((get) =>
  [...get(myDmxLightsAtom)].sort((a, b) => a.name.localeCompare(b.name))
);


export const myValidDmxLightsAtom = atom((get) => {
  // Get the list of DmxLights from myDmxLightsAtom
  const myDmxLights = get(myDmxLightsAtom);

  // Filter DmxLights that have all channel values greater than 0
  const validDmxLights = myDmxLights.filter((DmxLight: DmxFixture) => {
    const { channels } = DmxLight;

    // Check if all channel values in the channels object are greater than 0
    const areChannelsValid = Object.values(channels).every((value) => value > 0);

    // Include configChannels if they exist and ensure their values are valid
    if (DmxLight.config) {
      const { panHome, panMin, panMax, tiltHome, tiltMin, tiltMax } = DmxLight.config;
      const areConfigChannelsValid =
        panHome >= panMin && panHome <= panMax &&
        tiltHome >= tiltMin && tiltHome <= tiltMax;

      return areChannelsValid && areConfigChannelsValid;
    }

    return areChannelsValid;
  });

  // Sort the filtered list alphabetically by DmxLight name
  return validDmxLights.sort((a, b) => a.name.localeCompare(b.name));
});

export const activeDmxLightsConfigAtom = atom<LightingConfiguration | null>(null);


export const senderSacnEnabledAtom = atom<boolean>(false);

export const senderIpcEnabledAtom = atom<boolean>(false);

export const yargListenerEnabledAtom = atom<boolean>(false);

export const rb3eListenerEnabledAtom = atom<boolean>(false);

export const isSenderErrorAtom = atom<boolean>(false);
export const senderErrorAtom = atom<any>("");

export const effectDebounceTimeAtom = atom<number>(1600);

export const senderEnttecProEnabledAtom = atom<boolean>(false);
export const enttecProComPortAtom = atom<string>("");

export const lightingPrefsAtom = atom<any>({});
export const useComplexCuesAtom = atom<boolean>(false);

