import * as R from 'ramda';
import React, {useState} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import {BleManager, Device, State} from 'react-native-ble-plx';
import useDevice, {DeviceDefaults} from './useDevice';

export const manager = new BleManager();

const useBle = (defaults: DeviceDefaults) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const connectedDevice = useDevice(manager, defaults);

  React.useEffect(() => {
    const scanAndConnect = () => {
      manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          // Handle error (scanning will be stopped automatically)
          console.error(error);
          return;
        }

        if (device?.name) {
          setDevices(R.pipe(R.append(device), R.uniqBy(R.prop('id'))));
        }
      });
    };

    if (Platform.OS === 'ios') {
      manager
        .state()
        .then(R.when(R.equals<State>(State.PoweredOn), scanAndConnect));
      manager.onStateChange((state) => {
        if (state === State.PoweredOn) {
          scanAndConnect();
        }
      });
    } else {
      PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Permission Localisation Bluetooth',
          message: 'Requirement for Bluetooth',
          buttonNeutral: 'Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      ).then((value) => value === 'granted' && scanAndConnect());
    }

    return () => {
      manager.stopDeviceScan();
    };
  }, []);

  return {
    devices,
    ...connectedDevice,
  };
};

export default useBle;
