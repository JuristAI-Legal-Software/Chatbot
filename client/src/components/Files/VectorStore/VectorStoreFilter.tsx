import React from 'react';
import { useLocalize } from '~/hooks';

const VectorStoreFilter = () => {
  const localize = useLocalize();

  return <div>{localize('com_ui_filter')}</div>;
};

export default VectorStoreFilter;
