import React from 'react';
import { useLocalize } from '~/hooks';

export default function EmptyFilePreview() {
  const localize = useLocalize();

  return (
    <div className="h-full w-full content-center text-center font-bold">
      {localize('com_files_select_file')}
    </div>
  );
}
