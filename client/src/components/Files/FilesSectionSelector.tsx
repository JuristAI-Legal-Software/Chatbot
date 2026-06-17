import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import { Button } from '../ui';

export default function FilesSectionSelector() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();
  const selectedPage = location.pathname.includes('files') ? '/files' : '/vector-stores';

  const darkButton = { backgroundColor: 'black', color: 'white' };
  const lightButton = { backgroundColor: '#f9f9f9', color: 'black' };

  return (
    <div className="flex h-12 w-52 flex-row justify-center rounded border bg-white p-1">
      <div className="flex w-2/3 items-center pr-1">
        <Button
          className="w-full rounded rounded-lg border"
          style={selectedPage === '/vector-stores' ? darkButton : lightButton}
          onClick={() => {
            navigate('/d/vector-stores');
          }}
        >
          {localize('com_files_vector_stores')}
        </Button>
      </div>
      <div className="flex w-1/3 items-center">
        <Button
          className="w-full rounded rounded-lg border"
          style={selectedPage === '/files' ? darkButton : lightButton}
          onClick={() => {
            navigate('/d/files');
          }}
        >
          {localize('com_ui_files')}
        </Button>
      </div>
    </div>
  );
}
