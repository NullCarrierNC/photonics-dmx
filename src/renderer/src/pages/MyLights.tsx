import { useState } from 'react';
import { useAtom } from 'jotai';

import LightSettings from '../components/LightSettings';
import LightChannelsPreview from '../components/LightChannelsPreview';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { DmxFixture, FixtureTypes, } from '../../../photonics-dmx/types';
import { myDmxLightsAtom, sortedMyDmxLightsAtom } from '@renderer/atoms';
import { v4 as uuidv4 } from 'uuid';

const MyLights = () => {
  const [myLights, setMyLights] = useAtom(myDmxLightsAtom);
  const [myLightsSorted] = useAtom(sortedMyDmxLightsAtom);

  const [currentLight, setCurrentLight] = useState<DmxFixture | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const createNewLight = () => {
    setCurrentLight({
      id: null, // Set id to null for new light
      fixture: FixtureTypes.RGB,
      name: 'RGB',
      position: -1,
      label: 'An RGB Light',
      isStrobeEnabled: false,
      channels: { red: 0, green: 0, blue: 0, masterDimmer: 0 }, 
    });
  };



  const handleSave = () => {
    if (currentLight) {
      const lightToSave = {
        ...currentLight,
        id: currentLight.id ||uuidv4(), // Assign a unique id if it doesn't have one
      };

      // Update the light library in Jotai state
      setMyLights((prev) => {
        const existingIndex = prev.findIndex((light) => light.id === lightToSave.id);
        if (existingIndex >= 0) {
          const updatedLibrary = [...prev];
          updatedLibrary[existingIndex] = lightToSave;
          window.electron.ipcRenderer.send('save-my-lights', updatedLibrary);
          return updatedLibrary;
        }
        const newLibrary = [...prev, lightToSave];
        window.electron.ipcRenderer.send('save-my-lights', newLibrary);
        return newLibrary;
      });

      setCurrentLight(null);
    }
  };

  const handleDelete = () => {
    if (currentLight && currentLight.id) {
      const updatedMyLights = myLights.filter((light) => light.id !== currentLight.id);

      setMyLights(updatedMyLights);
      window.electron.ipcRenderer.send('save-my-lights', updatedMyLights);

      setCurrentLight(null);
      setShowDeleteModal(false);
    }
  };

  const handleCancel = () => {
    setCurrentLight(null);
  };

  const handleSelectLight = (light: DmxFixture) => {
    setCurrentLight(light);
  };

  const isExistingLight = currentLight && currentLight.id && myLights.some((light) => light.id === currentLight.id);

  return (
    <div className="p-6 w-full mx-auto bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200">
      <h1 className="text-2xl font-bold mb-4">My Lights</h1>

      <p className="text-md mb-6">
        Here you define the types of lights in your setup and map their DMX channels.
        Create <em>one</em> light for each unique type of fixture in your setup. The lights you create
        will be available in the <em>Lights Layout</em> where different channels can be assigned.
      </p>

      <p className="text-md mb-4">
        <strong>Note on Strobes:</strong> while some DMX fixtures support strobe channels, using this feature with different models 
        of can DMX lights cause the lights to stobe out of sync with each other. To avoid this, if you don't have a dedicated strobe light, 
        Photonics will use lights marked as strobe-capable as a strobe using regular DMX channels (E.g. RGB @ 255).
      </p>
     
      <p className='mb-4 mt-3 mb-2 italic font-bold text-orange-400'>
          Physical strobe fixtures are not functionally implemented in this version. They can be created but won't be used.</p>
        <p className='mb-4 italic font-bold text-orange-400'>
            Moving Head RGB lights are fundamentally supported, but will only 
            move to the configured home position. Lighting effects do not yet include motion. 
        </p>
        <p className='mb-6 italic font-bold text-orange-400'>
          Gobo based lights are not supported.
        </p>


      <p className="text-md mb-6">You <em>must</em> assign a channel value to all channels for a light to be valid. Invalid
        lights will have a red background and won't be usable in Light Layout.
      </p>


      <h2 className="text-xl font-semibold mb-2">Current Lights</h2>

      {myLightsSorted.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {myLightsSorted.map((light, index) => (
            <LightChannelsPreview
              key={light.id || index}
              light={light}
              onSelect={() => handleSelectLight(light)}
              isHighlighted={false}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-start">
          <p className="text-sm text-gray-500 mb-4">No lights configured</p>
        </div>
      )}

      <button
        onClick={createNewLight}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        + Light
      </button>

      <hr className="border-t border-gray-300 dark:border-gray-700 mt-6 mb-6" />

      {currentLight && (
        <>
          <LightSettings currentLight={currentLight} setCurrentLight={setCurrentLight} />

          <div className="flex space-x-4 mt-4">
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Save
            </button>

            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
            >
              Cancel
            </button>

            {isExistingLight && (
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Delete
              </button>
            )}
          </div>
        </>
      )}

      {showDeleteModal && (
        <ConfirmDeleteModal
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
};

export default MyLights;