import {differenceInMilliseconds} from 'date-fns';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {BleManager, Device} from 'react-native-ble-plx';
import SPDevice from '../device';
import {
  BackendDevice,
  DeviceUniqueFieldType,
  CharacteristicType,
  DeviceType,
  UniqueDeviceField,
  OnUniqueFieldChange,
  OnDeviceChoose,
  OnDataChange,
  OnDisconnect,
  DeviceFields,
  OnConnectionChange,
} from '../device.interface';
import {updateField} from '../utils/field';

export interface DeviceDefaults {
  started?: boolean;
  weight?: number;
}

const useDevice = (manager: BleManager, {started, weight}: DeviceDefaults) => {
  const [isConnected, setConnected] = useState(false);
  const [data, setData] = useState<DeviceFields | undefined>();
  const [isStarted, setStarted] = useState(false);
  const [uniqueField, setUniqueField] = useState<UniqueDeviceField[]>();
  const [device, setDevice] = useState<BackendDevice>();

  const restoreDate = useRef<Date>();
  const [millisecondsSpent, setMillisecondsSpent] = useState(0);

  // taken from apollo cache later
  const DEVICES_MOCK = useMemo<BackendDevice[]>(
    () => [
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
                      index: 4,
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
                  value: [{index: 6, value: 1}],
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
                      index: 4,
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
    ],
    [],
  );

  // Private methods to fetch data FROM the class

  const onRequestUpdateUniqueField = useCallback<OnUniqueFieldChange>(
    (id, value) => {
      currentDevice.current.changeUniqueField(id, value);
    },
    [],
  );

  const onUpdateUniqueField = useCallback<OnUniqueFieldChange>(
    (type, value) => {
      setUniqueField((previousUniqueField) =>
        previousUniqueField?.map(updateField(value, type)),
      );
    },
    [],
  );

  const onChooseDevice = useCallback<OnDeviceChoose>((newDevice) => {
    setDevice(newDevice);
    setUniqueField(newDevice.uniqueFields);
  }, []);

  const onChangeData = useCallback<OnDataChange>(
    (newData) => {
      setData(newData);

      if (restoreDate.current) {
        setMillisecondsSpent(
          (prevSpent) =>
            prevSpent +
            differenceInMilliseconds(
              new Date(),
              restoreDate.current ?? new Date(),
            ),
        );
      }
      restoreDate.current = isStarted ? new Date() : undefined;
    },
    [isStarted],
  );

  const onChangeConnected = useCallback<OnConnectionChange>((newConnected) => {
    setConnected(newConnected);

    if (!newConnected) {
      restoreDate.current = undefined;
      setMillisecondsSpent(0);
    }
  }, []);

  const onDisconnect = useCallback<OnDisconnect>(() => {
    setConnected(false);
    setData(undefined);
    setUniqueField(undefined);
    setDevice(undefined);
  }, []);

  const currentDevice = useRef(
    new SPDevice(
      onChangeConnected,
      onChangeData,
      onUpdateUniqueField,
      onRequestUpdateUniqueField,
      setStarted,
      onChooseDevice,
      onDisconnect,
      DEVICES_MOCK,
      started,
      weight,
    ),
  );

  // all the data we pass to the constructor is saved only once. In case any of the
  // dependencies changes - class wouldn't work as expected.
  // That's why we need to update fields in useEffect
  useEffect(() => {
    currentDevice.current.onConnectionChange = onChangeConnected;
  }, [onChangeConnected]);

  useEffect(() => {
    currentDevice.current.onDataChange = onChangeData;
  }, [onChangeData]);

  useEffect(() => {
    currentDevice.current.onUniqueFieldChange = onUpdateUniqueField;
  }, [onUpdateUniqueField]);

  useEffect(() => {
    currentDevice.current.onUniqueFieldChangeRequest =
      onRequestUpdateUniqueField;
  }, [onRequestUpdateUniqueField]);

  useEffect(() => {
    currentDevice.current.onStartedChange = setStarted;
  }, [setStarted]);

  useEffect(() => {
    currentDevice.current.onDeviceChoose = onChooseDevice;
  }, [onChooseDevice]);

  useEffect(() => {
    currentDevice.current.onDisconnect = onDisconnect;
  }, [onDisconnect]);

  useEffect(() => {
    currentDevice.current.setAvailableDevices(DEVICES_MOCK);
  }, [DEVICES_MOCK]);

  useEffect(() => {
    if (weight) {
      currentDevice.current.changeWeight(weight);
    }
  }, [weight]);

  // Public fields to work with from components

  const connectDevice = useCallback(
    async (newDevice: Device) => {
      try {
        manager.stopDeviceScan();

        currentDevice.current.connect(newDevice);
      } catch (err) {
        console.error(err);
      }
    },
    [manager],
  );

  const disconnectDevice = useCallback(() => {
    currentDevice.current.disconnect();
  }, []);

  const changeStarted = useCallback<OnConnectionChange>(
    (newStarted) => currentDevice.current.changeStarted(newStarted),
    [],
  );

  const changeUniqueField = useCallback<OnUniqueFieldChange>(
    (type, newValue) => currentDevice.current.changeUniqueField(type, newValue),
    [],
  );

  return {
    connectDevice,
    disconnectDevice,
    changeUniqueField,
    changeStarted,
    device,
    isConnected,
    data,
    millisecondsSpent,
    isStarted,
    uniqueField,
  };
};

export default useDevice;
