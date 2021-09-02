import {differenceInMilliseconds} from 'date-fns';
import {useCallback, useEffect, useRef, useState} from 'react';
import {BleManager, Device} from 'react-native-ble-plx';
import SPDevice, {
  DeviceType,
  DeviceUniqueField,
  IData,
  IDevice,
} from '../device';

const DEVICES_MOCK: IDevice[] = [
  {
    id: '3123213132',
    characteristicId: '0000fff1-0000-1000-8000-00805f9b34f1',
    uniqueFields: [DeviceUniqueField.RESISTANCE],
    type: DeviceType.THREADMILL,
    hasHeartRate: true,
  },
  {
    id: 'FBC96C7B-FFC3-AC6E-26C0-5D983DB8FE76',
    characteristicId: '0000fff1-0000-1000-8000-00805f9b34fb',
    uniqueFields: [DeviceUniqueField.RESISTANCE],
    type: DeviceType.XBIKE,
    hasHeartRate: true,
  },
];

const useDevice = (manager: BleManager) => {
  // const [currentDevice, setCurrentDevice] = useState<Device>();

  const [isConnected, setConnected] = useState(false);
  const [data, setData] = useState<IData | undefined>();
  const [isStarted, setStarted] = useState(false);
  const [uniqueField, setUniqueField] = useState(1);

  const previousTickDate = useRef<Date>();
  const [millisecondsSpent, setMillisecondsSpent] = useState(0);

  const onUniqueFieldChangeRequest = (d: number) => {
    currentDevice.current.changeUniqueField(d);
  };

  const onChangeData = useCallback<(newData: IData) => void>(
    (newData) => {
      setData(newData);
      if (previousTickDate.current) {
        setMillisecondsSpent(
          (prevSpent) =>
            prevSpent +
            differenceInMilliseconds(
              new Date(),
              previousTickDate.current ?? new Date(),
            ),
        );
      }
      previousTickDate.current = isStarted ? new Date() : undefined;
    },
    [isStarted],
  );

  useEffect(() => {
    currentDevice.current.onDataChange = onChangeData;
  }, [onChangeData]);

  const onChangeConnected = useCallback<(newConnected: boolean) => void>(
    (newConnected) => {
      setConnected(newConnected);

      if (!newConnected) {
        previousTickDate.current = undefined;
        setMillisecondsSpent(0);
      }
    },
    [],
  );

  const currentDevice = useRef(
    new SPDevice(
      onChangeConnected,
      onChangeData,
      setUniqueField,
      onUniqueFieldChangeRequest,
      setStarted,
      DEVICES_MOCK,
      false,
      80,
    ),
  );

  // const handleMonitor = (
  //   err: BleError | null,
  //   characteristic: Characteristic | null,
  // ) => {
  //   if (err) {
  //     setCharacteristics((prev) => {
  //       if (characteristic) {
  //         delete prev[characteristic.id];
  //       }

  //       return {...prev};
  //     });
  //   }
  //   console.warn(
  //     'newValue at 4',
  //     characteristic?.value,
  //     characteristic?.value && base64.toByteArray(characteristic.value),
  //   );

  //   if (characteristic) {
  //     setCharacteristics((prev) => ({
  //       ...prev,
  //       [characteristic.id]: characteristic,
  //     }));
  //   }
  // };

  const connectDevice = useCallback(
    async (device: Device) => {
      try {
        manager.stopDeviceScan();

        currentDevice.current.connect(device);
      } catch (err) {
        console.error(err);
      }
    },
    [manager],
  );

  const disconnectDevice = useCallback(() => {
    currentDevice.current.disconnect();
  }, []);

  // const toggleCharacteristic = async (
  //   id: string,
  //   incline: number,
  //   isStarted: boolean,
  // ) => {
  //   try {
  //     if (interval.current) {
  //       clearInterval(interval.current);
  //       interval.current = undefined;

  //       const characteristic = characteristics[id];

  //       console.log('characteristic', characteristic);
  //       if (!characteristic) {
  //         return;
  //       }

  //       const val = createByteArray([0x20, 0, 0, 0x00]);

  //       characteristic.writeWithoutResponse(base64.fromByteArray(val));
  //       return;
  //     }
  //     const characteristic = characteristics[id];
  //     if (!characteristic) {
  //       return;
  //     }

  //     if (characteristic.isWritableWithResponse) {
  //       const val = createByteArray([
  //         0x20,
  //         isStarted ? 0x01 : 0x00,
  //         incline,
  //         0x00,
  //       ]);

  //       console.warn(
  //         'val',
  //         val,
  //         base64.fromByteArray(val),
  //         base64.toByteArray(base64.fromByteArray(val)),
  //       );

  //       interval.current = setInterval(
  //         () =>
  //           characteristic
  //             .writeWithoutResponse(base64.fromByteArray(val))
  //             .catch((err) => {
  //               console.error(err);
  //               if (interval.current) {
  //                 clearInterval(interval.current);
  //                 interval.current = undefined;
  //               }
  //             }),
  //         50,
  //       );
  //     }
  //   } catch (err) {
  //     console.error(err);
  //   }
  // };

  return {
    connectDevice,
    disconnectDevice,
    currentDevice,
    isConnected,
    data,
    millisecondsSpent,
    isStarted,
    uniqueField,
  };
};

export default useDevice;
