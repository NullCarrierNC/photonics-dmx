import { useEffect, useState } from 'react';
import YargToggle from './YargToggle';
import Rb3Toggle from './Rb3Toggle';
import EnttecProToggle from './EnttecProToggle';
import SacnToggle from './SacnToggle';
import ArtNetToggle from './ArtNetToggle';
import { FaChevronCircleDown, FaChevronCircleRight } from 'react-icons/fa';


interface DmxSettingsProps {
  startOpen: boolean,
}


const DmxSettingsAccordion = ({ startOpen }: DmxSettingsProps ) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(()=>{
    setIsOpen(startOpen);
  },[startOpen])

  return (
    <div className=" rounded-lg shadow-sm mb-8">
      <button
        className="flex flex-row gap-4 items-center  text-left font-semibold bg-gray-100 dark:bg-gray-800"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>Game Settings</span>
        {isOpen ? <FaChevronCircleDown size={20} /> : <FaChevronCircleRight size={20} />}
      </button>

      {isOpen && (
        <div className="p-4">
          <div className="flex flex-row gap-16 items-start">
            <YargToggle /> <Rb3Toggle />
          </div>
          
          <div className="flex flex-row gap-16 items-start mt-2">
            <SacnToggle /> <EnttecProToggle />
          </div>
          <div className="flex flex-row gap-16 items-start mt-2">
            <ArtNetToggle />
          </div>
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