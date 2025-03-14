import React from 'react';
import { useAtom } from 'jotai';
import { isSenderErrorAtom, senderErrorAtom } from '../atoms';

const SenderErrorIndicator: React.FC = () => {
  const [isSenderError] = useAtom(isSenderErrorAtom);
  const [error] = useAtom(senderErrorAtom);

  if (!isSenderError) {
    return null; 
  }

  return (
    <div className=" ">
      <span className="px-3 py-1 text-xs font-semibold bg-red-500 text-white rounded-full shadow-md">
        {JSON.stringify(error) }
      </span>
    </div>
  );
};

export default SenderErrorIndicator;