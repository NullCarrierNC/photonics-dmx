import { useEffect, useState, useMemo } from 'react';
import { useAtom } from 'jotai';
import YargToggle from './YargToggle';
import Rb3Toggle from './Rb3Toggle';
import EnttecProToggle from './EnttecProToggle';
import SacnToggle from './SacnToggle';
import ArtNetToggle from './ArtNetToggle';
import { FaChevronCircleDown, FaChevronCircleRight } from 'react-icons/fa';
import { myValidDmxLightsAtom } from '../atoms';


interface DmxSettingsProps {
  startOpen: boolean,
}


const DmxSettingsAccordion = ({ startOpen }: DmxSettingsProps ) => {
  const [isOpen, setIsOpen] = useState(false);
  const [validDmxLights] = useAtom(myValidDmxLightsAtom);

  useEffect(()=>{
    setIsOpen(startOpen);
  },[startOpen])

  const hasInvalidConfig = useMemo(() => validDmxLights.length === 0, [validDmxLights.length]);

  return (
    <div className=" rounded-lg shadow-sm mb-4">
      <button
        className="flex flex-row gap-4 items-center text-left font-semibold bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>Game Settings</span>
        {isOpen ? <FaChevronCircleDown size={20} /> : <FaChevronCircleRight size={20} />}
      </button>

      {isOpen && (
        <div className="p-4">
          <div className="flex flex-row gap-16 items-start">
            <YargToggle disabled={hasInvalidConfig} /> <Rb3Toggle disabled={hasInvalidConfig} />
          </div>
          
          <div className="flex flex-row gap-16 items-start">
            <SacnToggle disabled={hasInvalidConfig} /> <EnttecProToggle disabled={hasInvalidConfig} />
          </div>
          <div className="flex flex-row gap-16 items-start ">
            <ArtNetToggle disabled={hasInvalidConfig} />
          </div>
          
          {hasInvalidConfig && (
            <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    You must configure your lights in My Lights and Lights Layout first.
                  </h3>
                  
                </div>
              </div>
            </div>
          )}
          
          {/*
          Manual cue style selection is disabled: RB and YARG will automatically select the matching cue handler.
          Leaving this here so when I revisit RB3 Cue handling I can switch between LED or cue based effects.

          <div className="flex flex-row gap-8 items-start mt-6">
            <CueStyleToggle /> 
          </div>
          <div className="flex flex-row gap-8 items-start mt-6">
            <DebounceSetting />
          </div>
            */}
        </div>
      )}
    </div>
  );
};

export default DmxSettingsAccordion;