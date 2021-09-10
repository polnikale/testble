import {differenceInMilliseconds} from 'date-fns';
import R from 'ramda';
import {useCallback, useEffect, useRef, useState} from 'react';
import {BleManager, Device} from 'react-native-ble-plx';
import SPDevice from './device';
import {
  BackendDevice,
  CharacteristicType,
  DeviceFields,
  DeviceType,
  DeviceUniqueFieldType,
  OnConnectionChange,
  OnDataChange,
  OnDeviceChoose,
  OnDeviceFind,
  OnDisconnect,
  OnUniqueFieldChange,
  UniqueDeviceField,
} from './device.interface';
import {updateField} from './field';
import {useLocalDeviceContext} from './LocalDeviceContext';

export interface DeviceDefaults {
  started?: boolean;
  weight?: number;
  onUniqueFieldChangeRequest?: OnUniqueFieldChange;
}

const SPEED_MOCK: UniqueDeviceField = {
  type: DeviceUniqueFieldType.SPEED,
  get: {
    lowByte: 3,
    lowByteMultiplier: 0.1,
    highByte: 2,
    highByteMultiplier: 10,
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
};

const ROWER_RESISTANCE_MOCK: UniqueDeviceField = {
  type: DeviceUniqueFieldType.RESISTANCE,
  get: {
    lowByte: 10,
    byte: [
      {
        index: 1,
        value: [{index: 6, value: 0}],
      },
      {index: 0, value: CharacteristicType.WORKOUT},
    ],
  },
  set: {
    byte: 2,
  },
};

const COUNT_MOCK: UniqueDeviceField = {
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
};

const BIKE_RESISTANCE_MOCK: UniqueDeviceField = {
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
};

const DEVICES_MOCK: BackendDevice[] = [
  {
    uniqueFields: [ROWER_RESISTANCE_MOCK, COUNT_MOCK],
    type: DeviceType.Rower,
    hasHeartRate: false,
  },
  {
    uniqueFields: [ROWER_RESISTANCE_MOCK, COUNT_MOCK],
    type: DeviceType.Stepper,
    hasHeartRate: true,
  },
  {
    uniqueFields: [BIKE_RESISTANCE_MOCK, SPEED_MOCK],
    type: DeviceType.XBike,
    hasHeartRate: true,
  },
  {
    uniqueFields: [BIKE_RESISTANCE_MOCK, SPEED_MOCK],
    type: DeviceType.Mbike,
    hasHeartRate: true,
  },
  {
    uniqueFields: [BIKE_RESISTANCE_MOCK, SPEED_MOCK],
    type: DeviceType.Crosstrainer,
    hasHeartRate: true,
  },
  {
    uniqueFields: [BIKE_RESISTANCE_MOCK, SPEED_MOCK],
    type: DeviceType.Treadmill,
    hasHeartRate: true,
  },
];

const useDevice = (
  manager: BleManager,
  {started, weight, onUniqueFieldChangeRequest = () => {}}: DeviceDefaults,
) => {
  // TODO: refactor to reducer
  const [isConnected, setConnected] = useState(false);
  const [commonFields, setCommonFields] = useState<DeviceFields | undefined>();
  const [isStarted, setStarted] = useState(started);
  const [uniqueFields, setUniqueFields] = useState<UniqueDeviceField[]>();
  const [device, setDevice] = useState<BackendDevice>();
  const [bleDevice, setBleDevice] = useState<Device>();

  const {localDevices, onLocalDeviceAdd} = useLocalDeviceContext();

  const restoreDate = useRef<Date>();
  const [millisecondsSpent, setMillisecondsSpent] = useState(0);

  // Private methods to fetch commonFields FROM the class

  const onUpdateUniqueField = useCallback<OnUniqueFieldChange>(
    (type, value) => {
      setUniqueFields((previousUniqueField) =>
        previousUniqueField?.map(updateField(value, type)),
      );
    },
    [],
  );

  const onChooseDevice = useCallback<OnDeviceChoose>(
    (newDevice, newBleDevice) => {
      setDevice(newDevice);
      setBleDevice(newBleDevice);
      setUniqueFields(newDevice.uniqueFields);
    },
    [],
  );

  const onChangeData = useCallback<OnDataChange>(
    (newData) => {
      setCommonFields(newData);

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
    setCommonFields(undefined);
    setUniqueFields(undefined);
    setDevice(undefined);
    setBleDevice(undefined);
  }, []);

  const onDeviceFind = useCallback<OnDeviceFind>(
    (localId, deviceType) => {
      const newDevice = DEVICES_MOCK.find(R.propEq('type', deviceType));

      if (newDevice) {
        onLocalDeviceAdd(localId, newDevice);
      }
    },
    [onLocalDeviceAdd],
  );

  const currentDevice = useRef(
    new SPDevice({
      onConnectionChange: onChangeConnected,
      onDataChange: onChangeData,
      onUniqueFieldChange: onUpdateUniqueField,
      onUniqueFieldChangeRequest,
      onStartedChange: setStarted,
      onDeviceChoose: onChooseDevice,
      onDeviceFind,
      onDisconnect,
      availableDevices: localDevices,
      isStarted: started,
      weight,
    }),
  );

  // all the commonFields we pass to the constructor is saved only once. In case any of the
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
      onUniqueFieldChangeRequest;
  }, [onUniqueFieldChangeRequest]);

  useEffect(() => {
    currentDevice.current.onStartedChange = setStarted;
  }, [setStarted]);

  useEffect(() => {
    currentDevice.current.onDeviceFind = onDeviceFind;
  }, [onDeviceFind]);

  useEffect(() => {
    currentDevice.current.onDeviceChoose = onChooseDevice;
  }, [onChooseDevice]);

  useEffect(() => {
    currentDevice.current.onDisconnect = onDisconnect;
  }, [onDisconnect]);

  useEffect(() => {
    currentDevice.current.setAvailableDevices(localDevices);
  }, [localDevices]);

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
    bleDevice,
    isConnected,
    commonFields,
    millisecondsSpent,
    isStarted,
    uniqueFields,
  };
};

export default useDevice;
