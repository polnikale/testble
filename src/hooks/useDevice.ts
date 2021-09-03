import {differenceInMilliseconds} from 'date-fns';
import {pipe} from 'fp-ts/lib/function';
import * as R from 'ramda';
import {useCallback, useEffect, useRef, useState} from 'react';
import {BleManager, Device} from 'react-native-ble-plx';
import SPDevice, {
  CharacteristicType,
  DeviceField,
  DeviceFieldType,
  DeviceType,
  DeviceUniqueFieldType,
  Fields,
  IDevice,
  OnDataChange,
  OnDeviceChoose,
  OnDisconnect,
  OnUniqueFieldChange,
  UniqueDeviceField,
  updateField,
} from '../device';

const DEVICES_MOCK: IDevice[] = [
  {
    id: 'DDCF573F-B656-661E-BD45-CE6E0943D9A0',
    characteristicId: '0000fff1-0000-1000-8000-00805f9b34fb',
    uniqueFields: [
      {
        type: DeviceUniqueFieldType.RESISTANCE,
        get: {
          lowByte: 10,
          byte: [
            {
              index: 1,
              value: 32,
            },
            {index: 0, value: CharacteristicType.WORKOUT},
          ],
        },
        set: {
          byte: 2,
        },
      },
      {
        type: DeviceUniqueFieldType.COUNT,
        get: {
          lowByte: 3,
          highByte: 2,
          highByteMultiplier: 100,
          byte: [
            {index: 0, value: CharacteristicType.WORKOUT},
            {
              index: 1,
              value: [
                {
                  index: 1,
                  value: 0,
                },
                {
                  index: 0,
                  value: 1,
                },
                {
                  index: 2,
                  value: 0,
                },
              ],
            },
          ],
          accumulative: true,
        },
      },
    ],
    type: DeviceType.THREADMILL,
    hasHeartRate: false,
  },
  {
    id: 'FBC96C7B-FFC3-AC6E-26C0-5D983DB8FE76',
    characteristicId: '0000fff1-0000-1000-8000-00805f9b34fb',
    uniqueFields: [
      {
        type: DeviceUniqueFieldType.RESISTANCE,
        get: {
          lowByte: 10,
          byte: [
            {
              index: 1,
              value: 112,
            },
            {index: 0, value: CharacteristicType.WORKOUT},
          ],
        },
        set: {
          byte: 2,
        },
      },
      {
        type: DeviceUniqueFieldType.SPEED,
        get: {
          lowByte: 3,
          lowByteMultiplier: 100,
          highByte: 2,
          highByteMultiplier: 10000,
          byte: [
            {index: 0, value: CharacteristicType.WORKOUT},
            {
              index: 1,
              value: [
                {
                  index: 1,
                  value: 0,
                },
                {
                  index: 0,
                  value: 1,
                },
                {
                  index: 2,
                  value: 0,
                },
              ],
            },
          ],
        },
      },
    ],
    type: DeviceType.XBIKE,
    hasHeartRate: true,
  },
];

const useDevice = (manager: BleManager) => {
  const [isConnected, setConnected] = useState(false);
  const [data, setData] = useState<Fields | undefined>();
  const [isStarted, setStarted] = useState(false);
  const [uniqueField, setUniqueField] = useState<UniqueDeviceField[]>();

  const previousTickDate = useRef<Date>();
  const [millisecondsSpent, setMillisecondsSpent] = useState(0);

  const onUniqueFieldChangeRequest = useCallback<OnUniqueFieldChange>(
    (id, value) => {
      currentDevice.current.changeUniqueField(id, value);
    },
    [],
  );

  const updateUniqueField = useCallback<OnUniqueFieldChange>((type, value) => {
    setUniqueField((previousUniqueField) =>
      previousUniqueField?.map(updateField(value, type)),
    );
  }, []);

  const onChooseDevice = useCallback<OnDeviceChoose>(
    (device) => setUniqueField(device.uniqueFields),
    [],
  );

  const onChangeData = useCallback<OnDataChange>(
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

  const onDisconnect = useCallback<OnDisconnect>(() => {
    setConnected(false);
    setData(undefined);
    setUniqueField(undefined);
  }, []);

  const currentDevice = useRef(
    new SPDevice(
      onChangeConnected,
      onChangeData,
      updateUniqueField,
      onUniqueFieldChangeRequest,
      setStarted,
      onChooseDevice,
      onDisconnect,
      DEVICES_MOCK,
      false,
      80,
    ),
  );

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

  const changeWeight = useCallback<(weight: number) => void>((weight) => {
    currentDevice.current.changeWeight(weight);
  }, []);

  return {
    connectDevice,
    disconnectDevice,
    currentDevice,
    changeWeight,
    isConnected,
    data,
    millisecondsSpent,
    isStarted,
    uniqueField,
  };
};

export default useDevice;
