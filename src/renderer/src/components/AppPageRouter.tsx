import { Pages } from '../types';
import Status from '../pages/Status';
import MyLights from '../pages/MyLights';
import LightsLayout from '../pages/LightsLayout';
import NetworkDebug from '../pages/NetworkDebug';
import DmxPreview from '../pages/DmxPreview';
import CueSimulation from '../pages/CueSimulation';
import About from '../pages/About';
import Preferences from '../pages/Preferences';
import AudioSettings from '../pages/AudioSettings';
import { openCueEditorWindow } from '../ipcApi';

interface AppPageRouterProps {
  currentPage: Pages;
}

/**
 * Renders the page component for the current route.
 * Centralizes the currentPage switch so App.tsx stays focused on layout and IPC.
 */
export function AppPageRouter({ currentPage }: AppPageRouterProps): JSX.Element {
  switch (currentPage) {
    case Pages.Status:
      return <Status />;
    case Pages.MyLights:
      return <MyLights />;
    case Pages.LightLayout:
      return <LightsLayout />;
    case Pages.CuePreview:
      return <DmxPreview />;
    case Pages.CueSimulation:
      return <CueSimulation />;
    case Pages.CueSequencer:
    case Pages.CueEditor:
      return (
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">Cue Editor</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            The Cue Editor opens in a separate window.
          </p>
          <button
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500"
            onClick={() => openCueEditorWindow()}
          >
            Open Cue Editor
          </button>
        </div>
      );
    case Pages.NetworkDebug:
      return <NetworkDebug />;
    case Pages.Preferences:
      return <Preferences />;
    case Pages.AudioSettings:
      return <AudioSettings />;
    case Pages.About:
      return <About />;
    default:
      return <Status />;
  }
}
