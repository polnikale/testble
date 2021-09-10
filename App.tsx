import {LocalDeviceContextProvider} from './src/LocalDeviceContext';
import React from 'react';
import TEST_BLE from './TEST_BLE';

const App = () => {
  <LocalDeviceContextProvider>
    <TEST_BLE />
  </LocalDeviceContextProvider>;
};

export default App;
