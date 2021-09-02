import {differenceInMilliseconds} from 'date-fns';
import {useCallback, useEffect, useRef, useState} from 'react';
import {BleManager, Device} from 'react-native-ble-plx';
import SPDevice, {
  CharacteristicType,
  DeviceType,
  DeviceUniqueField,
  IData,
  IDevice,
  OnDeviceChoose,
  OnDisconnect,
  OnUniqueFieldChange,
  UniqueField,
} from '../device';
import * as R from 'ramda';

const DEVICES_MOCK: IDevice[] = [
  {
    id: 'DDCF573F-B656-661E-BD45-CE6E0943D9A0',
    characteristicId: '0000fff1-0000-1000-8000-00805f9b34fb',
    uniqueFields: {
      '0': {
        type: DeviceUniqueField.RESISTANCE,
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
      '1': {
        type: DeviceUniqueField.COUNT,
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
    },
    type: DeviceType.THREADMILL,
    hasHeartRate: false,
  },
  {
    id: 'FBC96C7B-FFC3-AC6E-26C0-5D983DB8FE76',
    characteristicId: '0000fff1-0000-1000-8000-00805f9b34fb',
    uniqueFields: {
      '0': {
        type: DeviceUniqueField.RESISTANCE,
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
      '1': {
        type: DeviceUniqueField.SPEED,
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
    },
    type: DeviceType.XBIKE,
    hasHeartRate: true,
  },
];

const useDevice = (manager: BleManager) => {
  // const [currentDevice, setCurrentDevice] = useState<Device>();

  const [isConnected, setConnected] = useState(false);
  const [data, setData] = useState<IData | undefined>();
  const [isStarted, setStarted] = useState(false);
  const [uniqueField, setUniqueField] = useState<Record<string, UniqueField>>();

  const previousTickDate = useRef<Date>();
  const [millisecondsSpent, setMillisecondsSpent] = useState(0);

  const onUniqueFieldChangeRequest = useCallback<OnUniqueFieldChange>(
    (id, value) => {
      currentDevice.current.changeUniqueField(id, value);
    },
    [],
  );

  const updateUniqueField = useCallback<OnUniqueFieldChange>((id, value) => {
    console.log('update', id, value);
    setUniqueField(R.assocPath([id, 'value'], value));
  }, []);

  const onChooseDevice = useCallback<OnDeviceChoose>(
    (device) => setUniqueField(device.uniqueFields),
    [],
  );

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
