import * as R from 'ramda';
import React, {useMemo, useState} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import {BleManager, Device} from 'react-native-ble-plx';
import useDevice from './useDevice';

// export const manager = new BleManager();

const useBle = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const manager = useMemo(() => new BleManager(), []);
  // const [data, setData] = useState<Characteristic[]>();
  // const [monitors, setMonitors] = useState<(Subscription | undefined)[]>();
  const {connectDevice, disconnectDevice, currentDevice, isConnected, ...data} =
    useDevice(manager);

  React.useEffect(() => {
    const scanAndConnect = () => {
      manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          // Handle error (scanning will be stopped automatically)
          console.error(error);
          return;
        }

        if (device?.name) {
          setDevices((prevDev) => R.uniqBy(R.prop('id'), [...prevDev, device]));
        }
      });
    };

    if (Platform.OS === 'ios') {
      manager.onStateChange((state) => {
        console.warn('State', state);
        if (state === 'PoweredOn') {
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
  }, [manager]);

  const toggleDevice = (device: Device) => {
    console.log('toggleDevice', device, isConnected);
    if (isConnected) {
      disconnectDevice();
    } else {
      connectDevice(device);
    }
  };

  return {
    devices,
    toggleDevice,
    currentDevice,
    ...data,
  };
};

export default useBle;
