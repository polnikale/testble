import * as R from 'ramda';
import {useEffect, useMemo, useState} from 'react';
import {PermissionsAndroid, PermissionStatus, Platform} from 'react-native';
import {Device, State} from 'react-native-ble-plx';
import {AVAILABLE_NAME} from './device';
import {manager} from './manager';
import useDevice, {DeviceDefaults} from './useDevice';

const useBle = (defaults: DeviceDefaults) => {
  const [devices, setDevices] = useState<Device[]>([]);
  // TODO: bring back later once I find out how to fix memory leak.
  // const [restoredDevice, setRestoredDevice] = useState<Device>();

  // const restoreStateFunction = useCallback<
  //   (state: BleRestoredState | null) => void
  // >(state => {
  //   if (state) {
  //     setRestoredDevice(state.connectedPeripherals[0]);
  //   }
  // }, []);

  const deviceManager = useDevice(manager, defaults);

  // useEffect(() => {
  //   if (restoredDevice) {
  //     deviceManager.connectDevice(restoredDevice);
  //   }
  // }, [deviceManager, restoredDevice]);

  const devicesToShow = useMemo(
    () => devices.filter(R.propEq('name', AVAILABLE_NAME)),
    [devices],
  );

  useEffect(() => {
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
      const handleIosPermission = R.when(
        R.equals<State>(State.PoweredOn),
        scanAndConnect,
      );

      manager.state().then(handleIosPermission);

      manager.onStateChange(handleIosPermission);
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
      ).then(R.when(R.equals<PermissionStatus>('granted'), scanAndConnect));
    }

    return () => {
      manager.stopDeviceScan();
    };
  }, []);

  return {
    devices: devicesToShow,
    ...deviceManager,
  };
};

export default useBle;
