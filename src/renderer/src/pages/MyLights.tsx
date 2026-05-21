import { useState } from 'react'
import { useAtom } from 'jotai'

import LightSettings from '../components/LightSettings'
import LightChannelsPreview from '../components/LightChannelsPreview'
import ConfirmModal from '../components/ConfirmModal'
import ToastContainer from '../components/Toast'
import { DmxFixture, FixtureTypes } from '../../../photonics-dmx/types'
import { myDmxLightsAtom, sortedMyDmxLightsAtom } from '@renderer/atoms'
import { saveMyLights } from '../ipcApi'
import { useToast } from '../hooks/useToast'

const MyLights = () => {
  const { toasts, showToast, hideToast } = useToast()
  const [myLights, setMyLights] = useAtom(myDmxLightsAtom)
  const [myLightsSorted] = useAtom(sortedMyDmxLightsAtom)

  const [currentLight, setCurrentLight] = useState<DmxFixture | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const createNewLight = () => {
    setCurrentLight({
      id: null, // Set id to null for new light
      fixture: FixtureTypes.RGB,
      name: 'RGB',
      position: -1,
      label: 'An RGB Light',
      isStrobeEnabled: false,
      channels: { red: 0, green: 0, blue: 0, masterDimmer: 0 },
    })
  }

  const handleSave = async () => {
    if (!currentLight) return
    const lightToSave: DmxFixture = {
      ...currentLight,
      id: currentLight.id || crypto.randomUUID(),
    }

    const existingIndex = myLights.findIndex((light) => light.id === lightToSave.id)
    const nextLibrary =
      existingIndex >= 0
        ? (() => {
            const u = [...myLights]
            u[existingIndex] = lightToSave
            return u
          })()
        : [...myLights, lightToSave]

    setMyLights(nextLibrary)
    const result = await saveMyLights(nextLibrary)
    if (!result.success) {
      showToast(result.error, 'error', 5000)
      return
    }
    setCurrentLight(null)
  }

  const handleDelete = async () => {
    if (currentLight && currentLight.id) {
      const updatedMyLights = myLights.filter((light) => light.id !== currentLight.id)
      setMyLights(updatedMyLights)
      const result = await saveMyLights(updatedMyLights)
      if (!result.success) {
        showToast(result.error, 'error', 5000)
        return
      }
      setCurrentLight(null)
      setShowDeleteModal(false)
    }
  }

  const handleCancel = () => {
    setCurrentLight(null)
  }

  const handleSelectLight = (light: DmxFixture) => {
    setCurrentLight(light)
  }

  const isExistingLight =
    currentLight && currentLight.id && myLights.some((light) => light.id === currentLight.id)

  return (
    <div className="p-6 w-full mx-auto bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200">
      <ToastContainer toasts={toasts} onDismiss={hideToast} />
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">My Lights</h1>

      {/* prettier-ignore */}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Here you define the types of lights in your setup and map their DMX channels. Create{' '}
        <em>one</em> light for each unique type of fixture in your setup. The lights you create will
        be available in the <em>Lights Layout</em> where different channels can be assigned.
      </p>

      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
        <p className="mb-2">
          <strong>Note on Strobes:</strong> there are four possible strobe configurations:
        </p>
        <ol className="mt-0 mb-0 ml-6 list-decimal list-outside space-y-2 pl-2 marker:font-normal marker:text-gray-700 dark:marker:text-gray-300">
          <li className="pl-1">No strobes: strobe effects are just ignored.</li>
          <li className="pl-1">
            <span className="font-medium text-red-600 dark:text-red-400">Physical Strobe</span>: DMX
            fixtures specifically designed as a strobe light. You can configure these, but in this
            version of Photonics these are not yet supported in-game.
          </li>
          <li className="pl-1">
            <span className="font-medium text-green-600 dark:text-green-400">
              Strobe Enabled Lights
            </span>
            : Regular RGB PAR lights that also act as strobes. The flashing is achieved by manually
            flashing the DMX channels. This works for most lights, but the speed of the strobe is
            limited by your hardware. This is the recommended mode.
          </li>
          <li className="pl-1">
            <span className="font-medium text-orange-600 dark:text-orange-400">
              Strobe Channels
            </span>
            : Regular RGB PAR lights that have a dedicated strobe channel. The flashing is achieved
            by the light's hardware itself. This generally provides the fastest strobe speeds, but
            is difficult to exactly match in-game. No two lights use the same speed values, so you
            will have to experiment with the values to get the best result. If you have a mix of
            makes/models of lights, this is even more difficult to sync up. We recommend using
            Strobe Enabled Lights.
          </li>
        </ol>
      </div>
      <p className="mb-4 italic font-bold text-orange-400  text-[9pt]">
        Gobo (colour wheel) based lights are not supported.
      </p>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        You <em>must</em> assign a channel value to all channels for a light to be valid. Invalid
        lights will have a red background and won't be usable in Light Layout.
      </p>

      <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">
        Assigning Channels
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Assign the base channels used for your light. E.g. if your light's manual says that if the
        Master Dimmer is 1, the Red channel is 2, the Green channel is 3, and the Blue channel is 4,
        then you would assign 1 to Master Dimmer, 2 to Red, 3 to Green, and 4 to Blue.
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Don't assign the same light twice here: in Light Layout you can assign this template to as
        many different physical lights as you want. This is for defining the channel relationships.
      </p>

      <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">
        Current Lights
      </h2>

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
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
        + Light
      </button>

      <hr className="border-t border-gray-200 dark:border-gray-600 mt-6 mb-6" />

      {currentLight && (
        <>
          <LightSettings currentLight={currentLight} setCurrentLight={setCurrentLight} />

          <div className="flex space-x-4 mt-4">
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
              Save
            </button>

            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500">
              Cancel
            </button>

            {isExistingLight && (
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
                Delete
              </button>
            )}
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Confirm Delete"
        message="Are you sure you want to delete this light?"
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          void handleDelete()
        }}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  )
}

export default MyLights
